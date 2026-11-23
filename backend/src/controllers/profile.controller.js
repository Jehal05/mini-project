import mongoose from 'mongoose';
import { appEvents, EVENTS } from '../events.js';
import { config } from '../config/env.js';
import { Counter } from '../models/Counter.js';
import { Document } from '../models/Document.js';
import { Patient } from '../models/Patient.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { randomToken } from '../utils/crypto.js';
import { InvalidImageError, detectFileType, sanitizeUpload } from '../utils/fileType.js';
import { sendMail } from '../utils/mailer.js';
import { documentUploadSchema, SECTION_LIMIT } from '../utils/profileSchemas.js';
import { consumeQuota } from '../utils/quota.js';
import { deleteFile, readFile, saveFile } from '../utils/storage.js';
import { presentPatient } from '../services/patientSummary.js';

const oid = (id) => new mongoose.Types.ObjectId(id);
const HOUR = 60 * 60 * 1000;
const NO_STORE = 'private, no-store';

// ---- helpers ---------------------------------------------------------------------------------------------

/** Feature 98: every edit is logged with the section and operation only, never the health data itself. */
const logEdit = (req, section, op) => {
  appEvents.emit(EVENTS.PROFILE_CHANGED, { patient: String(req.patient._id) });
  return writeAudit({ req, action: 'record.edit', resourceType: 'patient', resourceId: req.patient.patientId, meta: { section, op } });
};

async function respondWithPatient(req, res, status = 200) {
  const fresh = await Patient.findById(req.patient._id);
  res.status(status).json({ patient: presentPatient(fresh) });
}

export const passportUrl = (token) => `${config.clientOrigin.replace(/\/$/, '')}/p/${token}`;

// ---- personal information, preferences (features 8, 11, 12) ---------------------------------------------

export async function getMe(req, res) {
  res.json({ patient: presentPatient(req.patient) });
}

export async function updatePersonal(req, res) {
  await Patient.updateOne({ _id: req.patient._id }, { $set: req.valid }, { runValidators: true });
  if (req.valid.fullName) await User.updateOne({ _id: req.user.id }, { $set: { name: req.valid.fullName } });
  await logEdit(req, 'personal', 'update');
  await respondWithPatient(req, res);
}

export async function updatePreferences(req, res) {
  const { email, webPush, whatsapp, locationConsent } = req.valid;
  const set = {
    ...(email !== undefined && { 'notificationPreferences.email': email }),
    ...(webPush !== undefined && { 'notificationPreferences.webPush': webPush }),
    ...(whatsapp !== undefined && { 'notificationPreferences.whatsapp': whatsapp }),
    ...(locationConsent !== undefined && { 'consent.location': locationConsent }),
  };
  await Patient.updateOne({ _id: req.patient._id }, { $set: set });
  await logEdit(req, 'preferences', 'update');
  await respondWithPatient(req, res);
}

// ---- medical sections (features 13-18): one atomic update per change -------------------------------------

// Entries that a hospital wrote (a discharge summary is linked) are read-only for the patient.
const hospitalOwned = (section) => (section === 'hospitalizations' ? { dischargeSummaryId: { $exists: false } } : {});

/** Sections where an empty list must be told apart from a list nobody filled in (see Patient.listsConfirmed). */
export const CONFIRMABLE = ['allergies', 'medications'];

/** "I have no known allergies / medicines": the patient states that the empty list is deliberate. */
export const confirmNone = (section) => async (req, res) => {
  const { matchedCount } = await Patient.updateOne(
    { _id: req.patient._id, [section]: { $size: 0 } },
    { $set: { [`listsConfirmed.${section}`]: true } },
  );
  if (!matchedCount) throw ApiError.conflict('Remove the entries first, or keep them as they are', 'LIST_NOT_EMPTY');
  await logEdit(req, section, 'confirm_none');
  await respondWithPatient(req, res);
};

export const addItem = (section) => async (req, res) => {
  // The size cap is part of the filter, so it holds even when many requests arrive together.
  const { matchedCount } = await Patient.updateOne(
    { _id: req.patient._id, [`${section}.${SECTION_LIMIT - 1}`]: { $exists: false } },
    { $push: { [section]: req.valid }, ...(CONFIRMABLE.includes(section) && { $set: { [`listsConfirmed.${section}`]: true } }) },
    { runValidators: true },
  );
  if (!matchedCount) throw ApiError.conflict(`You can keep at most ${SECTION_LIMIT} entries here`, 'SECTION_FULL');
  await logEdit(req, section, 'add');
  await respondWithPatient(req, res, 201);
};

async function explainMissingItem(req, section, itemId) {
  const exists = await Patient.exists({ _id: req.patient._id, [section]: { $elemMatch: { _id: itemId } } });
  if (exists) throw ApiError.forbidden('A hospital added this entry, so it cannot be changed here', 'HOSPITAL_ENTRY');
  throw ApiError.notFound('Entry not found');
}

export const updateItem = (section) => async (req, res) => {
  const itemId = oid(req.params.itemId);
  // A field sent as an empty string means "clear it" (validation turns '' into undefined).
  const cleared = Object.keys(req.valid).filter((k) => req.valid[k] === undefined && typeof req.body[k] === 'string' && req.body[k].trim() === '');
  const set = Object.fromEntries(Object.entries(req.valid).filter(([, v]) => v !== undefined).map(([k, v]) => [`${section}.$[el].${k}`, v]));
  const unset = Object.fromEntries(cleared.map((k) => [`${section}.$[el].${k}`, '']));
  const { matchedCount } = await Patient.updateOne(
    { _id: req.patient._id, [section]: { $elemMatch: { _id: itemId, ...hospitalOwned(section) } } },
    { ...(Object.keys(set).length && { $set: set }), ...(cleared.length && { $unset: unset }) },
    { arrayFilters: [{ 'el._id': itemId }], runValidators: true },
  );
  if (!matchedCount) await explainMissingItem(req, section, itemId);
  await logEdit(req, section, 'update');
  await respondWithPatient(req, res);
};

export const deleteItem = (section) => async (req, res) => {
  const itemId = oid(req.params.itemId);
  const { matchedCount } = await Patient.updateOne(
    { _id: req.patient._id, [section]: { $elemMatch: { _id: itemId, ...hospitalOwned(section) } } },
    { $pull: { [section]: { _id: itemId } } },
  );
  if (!matchedCount) await explainMissingItem(req, section, itemId);
  await logEdit(req, section, 'delete');
  await respondWithPatient(req, res);
};

// ---- emergency contacts (feature 9) ---------------------------------------------------------------------

export async function addContact(req, res) {
  const { priority, ...data } = req.valid;
  for (const p of priority ? [priority] : [1, 2, 3]) {
    // One atomic update: only succeeds while there are fewer than 3 contacts AND this priority is free.
    const { modifiedCount } = await Patient.updateOne(
      { _id: req.patient._id, 'emergencyContacts.2': { $exists: false }, emergencyContacts: { $not: { $elemMatch: { priority: p } } } },
      { $push: { emergencyContacts: { ...data, priority: p } } },
      { runValidators: true },
    );
    if (modifiedCount) {
      await logEdit(req, 'emergencyContacts', 'add');
      return respondWithPatient(req, res, 201);
    }
  }
  const current = await Patient.findById(req.patient._id).select('emergencyContacts');
  if (current.emergencyContacts.length >= 3) throw ApiError.conflict('You can have at most 3 emergency contacts', 'CONTACT_LIMIT');
  throw ApiError.conflict(`Priority ${priority} is already used by another contact`, 'PRIORITY_TAKEN');
}

export async function updateContact(req, res) {
  const contactId = oid(req.params.contactId);
  const set = Object.fromEntries(Object.entries(req.valid).map(([k, v]) => [`emergencyContacts.$[c].${k}`, v]));
  const unset = req.body.email === '' ? { 'emergencyContacts.$[c].email': '' } : null; // an empty email clears it
  const { matchedCount } = await Patient.updateOne(
    { _id: req.patient._id, 'emergencyContacts._id': contactId },
    { ...(Object.keys(set).length && { $set: set }), ...(unset && { $unset: unset }) },
    { arrayFilters: [{ 'c._id': contactId }], runValidators: true },
  );
  if (!matchedCount) throw ApiError.notFound('Contact not found');
  await logEdit(req, 'emergencyContacts', 'update');
  await respondWithPatient(req, res);
}

export async function deleteContact(req, res) {
  const contactId = oid(req.params.contactId);
  const { matchedCount } = await Patient.updateOne({ _id: req.patient._id, 'emergencyContacts._id': contactId }, { $pull: { emergencyContacts: { _id: contactId } } });
  if (!matchedCount) throw ApiError.notFound('Contact not found');
  await logEdit(req, 'emergencyContacts', 'delete');
  await respondWithPatient(req, res);
}

/** Reorders priorities. The filter requires exactly the current set of contacts, so a concurrent add or delete makes it fail rather than corrupt the order. */
export async function reorderContacts(req, res) {
  const ids = req.valid.order.map(oid);
  const set = {};
  const arrayFilters = [];
  ids.forEach((id, i) => {
    set[`emergencyContacts.$[c${i}].priority`] = i + 1;
    arrayFilters.push({ [`c${i}._id`]: id });
  });
  const { matchedCount } = await Patient.updateOne(
    { _id: req.patient._id, emergencyContacts: { $size: ids.length }, 'emergencyContacts._id': { $all: ids } },
    { $set: set },
    { arrayFilters },
  );
  if (!matchedCount) throw ApiError.conflict('The list must include each of your contacts exactly once', 'ORDER_MISMATCH');
  await logEdit(req, 'emergencyContacts', 'reorder');
  await respondWithPatient(req, res);
}

/** "Send test alert": emails the contact (if they have an email) and returns a pre-filled WhatsApp link. 3 per hour per contact. */
export async function testAlert(req, res) {
  const contact = req.patient.emergencyContacts.id(req.params.contactId);
  if (!contact) throw ApiError.notFound('Contact not found');

  const quota = await consumeQuota(`testalert:${contact._id}`, config.testAlertsPerContactPerHour, HOUR);
  if (!quota.allowed) {
    res.set('Retry-After', String(quota.retryAfterSeconds));
    throw ApiError.tooMany(`You can send ${config.testAlertsPerContactPerHour} test alerts per hour to each contact. Try again in ${Math.ceil(quota.retryAfterSeconds / 60)} minutes.`);
  }

  const message = `This is a TEST from HealthTwin AI (demonstration project). ${req.patient.fullName} listed you as an emergency contact. No emergency is happening.`;
  let email = 'skipped';
  if (contact.email) {
    try {
      await sendMail({ to: contact.email, subject: 'Test alert from HealthTwin AI', text: message });
      email = 'sent';
    } catch (err) {
      console.error('[mail] test alert failed', err.message);
      email = 'failed';
    }
  }
  await writeAudit({ req, action: 'contact.test_alert', resourceType: 'patient', resourceId: req.patient.patientId, meta: { email } });
  res.json({
    email,
    whatsappUrl: `https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`,
    remainingThisHour: Math.max(0, config.testAlertsPerContactPerHour - quota.count),
  });
}

// ---- photo (feature 8) and documents (feature 19) --------------------------------------------------------

export function checkedUpload(req, allowedKinds, label) {
  if (!req.file?.buffer?.length) throw new ApiError(400, 'FILE_REQUIRED', 'Choose a file to upload');
  const type = detectFileType(req.file.buffer);
  if (!type || !allowedKinds.includes(type.kind)) throw new ApiError(400, 'INVALID_FILE_TYPE', `${label} must be ${allowedKinds.map((k) => k.toUpperCase()).join(', ')} (checked from the file contents)`);
  try {
    return { type, data: sanitizeUpload(req.file.buffer, type) };
  } catch (err) {
    if (err instanceof InvalidImageError) throw new ApiError(400, 'INVALID_FILE', 'That image file is damaged or not valid');
    throw err;
  }
}

export async function savePhoto(req, res) {
  const { type, data } = checkedUpload(req, ['jpeg', 'png'], 'A photo');
  const storedName = await saveFile('photos', data, type.ext);
  const previous = req.patient.photoUrl;
  await Patient.updateOne({ _id: req.patient._id }, { $set: { photoUrl: storedName } });
  if (previous) await deleteFile('photos', previous);
  await logEdit(req, 'photo', 'update');
  await respondWithPatient(req, res);
}

export async function deletePhoto(req, res) {
  const previous = req.patient.photoUrl;
  if (previous) {
    await Patient.updateOne({ _id: req.patient._id }, { $unset: { photoUrl: '' } });
    await deleteFile('photos', previous);
    await logEdit(req, 'photo', 'delete');
  }
  await respondWithPatient(req, res);
}

export const mimeFor = (storedName) => (storedName.endsWith('.png') ? 'image/png' : storedName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

/** Headers for any file we hand back: never cached, never sniffed, never allowed to run anything. */
export function setFileHeaders(res, mime, filename) {
  res.set({
    'Content-Type': mime,
    'Cache-Control': NO_STORE,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    ...(filename && { 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}` }),
  });
}

export async function getPhoto(req, res) {
  if (!req.patient.photoUrl) throw ApiError.notFound('No photo');
  setFileHeaders(res, mimeFor(req.patient.photoUrl));
  res.send(await readFile('photos', req.patient.photoUrl));
}

// Slots are reserved with one atomic counter update, so 50 documents is a hard cap even under parallel uploads.
// (When the counter already sits at the cap, the upsert collides with its own _id: that duplicate-key error means "full".)
async function reserveDocumentSlot(patientId) {
  const key = `documents:${patientId}`;
  const max = config.uploads.maxDocumentsPerPatient;
  try {
    await Counter.findOneAndUpdate({ _id: key, seq: { $lt: max } }, { $inc: { seq: 1 } }, { upsert: true });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict(`You can keep at most ${max} documents. Delete one to add another.`, 'DOCUMENT_LIMIT');
    throw err;
  }
  return () => Counter.updateOne({ _id: key, seq: { $gt: 0 } }, { $inc: { seq: -1 } });
}

const cleanName = (name) => String(name ?? 'document').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 120) || 'document';

export async function uploadDocument(req, res) {
  const body = documentUploadSchema.safeParse(req.body ?? {});
  if (!body.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', Object.fromEntries(body.error.issues.map((i) => [i.path.join('.') || '_', i.message])));
  }
  const { type, data } = checkedUpload(req, ['pdf', 'jpeg', 'png'], 'A document');
  const release = await reserveDocumentSlot(req.patient._id);
  let storedName;
  try {
    storedName = await saveFile('documents', data, type.ext);
    const doc = await Document.create({ patient: req.patient._id, type: body.data.type, originalName: cleanName(req.file.originalname), storedName, mimeType: type.mime, size: data.length });
    await logEdit(req, 'documents', 'add');
    res.status(201).json({ document: doc.toJSON() });
  } catch (err) {
    if (storedName) await deleteFile('documents', storedName).catch(() => {});
    await release();
    throw err;
  }
}

export async function listDocuments(req, res) {
  const docs = await Document.find({ patient: req.patient._id }).sort({ uploadedAt: -1 });
  res.json({ documents: docs.map((d) => d.toJSON()) });
}

export async function getDocumentFile(req, res) {
  const doc = await Document.findOne({ _id: req.params.docId, patient: req.patient._id }); // scoped to the signed-in patient
  if (!doc) throw ApiError.notFound('Document not found');
  setFileHeaders(res, doc.mimeType, doc.originalName);
  res.send(await readFile('documents', doc.storedName));
}

export async function deleteDocument(req, res) {
  const doc = await Document.findOneAndDelete({ _id: req.params.docId, patient: req.patient._id });
  if (!doc) throw ApiError.notFound('Document not found');
  await deleteFile('documents', doc.storedName);
  await Counter.updateOne({ _id: `documents:${req.patient._id}`, seq: { $gt: 0 } }, { $inc: { seq: -1 } });
  await logEdit(req, 'documents', 'delete');
  res.json({ deleted: true });
}

// ---- QR passport, owner side (feature 20) ---------------------------------------------------------------

export async function getQr(req, res) {
  res.json({ url: passportUrl(req.patient.qrToken), rotatedAt: req.patient.qrRotatedAt ?? null });
}

/** Replaces the token in one update; the old link stops working the moment this returns. */
export async function regenerateQr(req, res) {
  const qrToken = randomToken(32);
  const rotatedAt = new Date();
  await Patient.updateOne({ _id: req.patient._id }, { $set: { qrToken, qrRotatedAt: rotatedAt } });
  await writeAudit({ req, action: 'qr.regenerate', resourceType: 'patient', resourceId: req.patient.patientId });
  res.json({ url: passportUrl(qrToken), rotatedAt });
}
