// Patient records: registration (1, 10), profile (8, 11, 12), emergency contacts (9), medical sections (13-18),
// documents (19), QR passport (20) and bystander report (106). Rules live here; storage is in patientRepo.js.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import { consumeQuota } from '../utils/quota.js';
import { InvalidImageError, detectFileType, sanitizeUpload } from '../utils/fileType.js';
import { deleteStored, readStored, saveFile } from '../utils/storage.js';
import { hashPassword, passwordProblems } from '../auth/password.js';
import * as authRepo from '../auth/authRepo.js';
import * as repo from './patientRepo.js';
import { PATIENT_EVENTS, patientEvents } from './events.js';
import { SECTION_LIMIT, invalid, validateUpload } from './validate.js';

const HOUR = 3600000;
const err = (status, message, code) => Object.assign(httpError(status, message), { code });
const newId = () => crypto.randomBytes(12).toString('hex');
const newQrToken = () => crypto.randomBytes(32).toString('hex');
const sid = (v) => String(v);
const TOKEN = /^[a-f0-9]{64}$/;

// ---- presentation -------------------------------------------------------------------------------------------

export function isBloodThinner(med) {
  if (med?.isBloodThinner) return true;
  const name = String(med?.drug ?? '').toLowerCase();
  return env.bloodThinnerDrugs.some((d) => new RegExp(`\\b${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(name));
}

export function ageOf(dob, now = new Date()) {
  if (!dob) return undefined;
  const d = new Date(dob);
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return years;
}

const withIds = (list = []) => list.map((x) => ({ ...x, id: sid(x._id), _id: undefined }));

/** The patient's own record, as sent to the patient: no internal ids, no QR token, blood thinners resolved. */
export function presentPatient(p) {
  const { user, qrToken, qrRotatedAt, photoFile, __v, _id, ...rest } = p;
  return {
    ...rest,
    id: sid(_id),
    age: ageOf(p.dateOfBirth),
    hasPhoto: Boolean(photoFile),
    cardiacConditions: withIds(p.cardiacConditions),
    medicalConditions: withIds(p.medicalConditions),
    allergies: withIds(p.allergies),
    medications: withIds(p.medications).map((m) => ({ ...m, isBloodThinner: isBloodThinner(m) })),
    hospitalizations: withIds(p.hospitalizations).map((h) => ({ ...h, dischargeSummaryId: h.dischargeSummaryId ? sid(h.dischargeSummaryId) : undefined, byHospital: Boolean(h.dischargeSummaryId) })),
    familyHistory: withIds(p.familyHistory),
    emergencyContacts: withIds(p.emergencyContacts).sort((a, b) => a.priority - b.priority),
  };
}

/** Feature 20 emergency tier: the ONLY facts a stranger who scans the QR can see. */
export function emergencySummary(p) {
  const c = [...(p.emergencyContacts ?? [])].sort((a, b) => a.priority - b.priority)[0];
  return {
    patientId: p.patientId ?? null,
    bloodGroup: p.bloodGroup ?? null,
    hasPhoto: Boolean(p.photoFile),
    severeAllergies: (p.allergies ?? []).filter((a) => a.severity === 'severe').map((a) => ({ allergen: a.allergen, reaction: a.reaction ?? null })),
    cardiacHistory: (p.cardiacConditions ?? []).map((x) => ({ type: x.type, year: x.year ?? null })),
    emergencyContact: c ? { name: c.name, relation: c.relation, phone: c.phone } : null,
  };
}

// ---- helpers --------------------------------------------------------------------------------------------------

async function load(patientId) {
  const p = patientId ? await repo.findPatient(patientId) : null;
  if (!p) throw err(404, 'Patient record not found', 'NO_PATIENT');
  return p;
}

async function commit(p, patch) {
  const next = await repo.savePatient(p._id, p.updatedAt, patch);
  if (!next) throw err(409, 'Your record changed while you were editing. Reload and try again.', 'CHANGED');
  return next;
}

/** Every edit is logged with the section and the operation only, never the health data itself. */
const logEdit = (user, p, section, op) => repo.writeAudit({ actor: user.id, action: 'record.edit', resourceType: 'patient', resourceRef: p.patientId, meta: { section, op } });

// ---- registration (features 1, 10) -----------------------------------------------------------------------------

export async function registerPatient(body) {
  const b = body ?? {};
  const fields = {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 120) fields.name = 'Enter your full name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fields.email = 'Enter a valid email';
  const problems = passwordProblems(b.password);
  if (problems.length) fields.password = problems.join(' ');
  if (b.consentDataUse !== true) fields.consentDataUse = 'You need to agree to the use of your data to create an account';
  if (Object.keys(fields).length) throw invalid(fields);
  if (await authRepo.findUserByEmail(email)) throw err(409, 'An account with this email already exists', 'EMAIL_TAKEN');

  const user = await authRepo.createUser({ name, email, role: 'patient', passwordHash: await hashPassword(b.password), isActive: true });
  try {
    const year = new Date().getFullYear();
    const patientId = `HT-${year}-${String(await repo.nextPatientSeq(year)).padStart(4, '0')}`;
    const patient = await repo.createPatient({
      patientId, user: user._id, fullName: name, qrToken: newQrToken(),
      consent: { location: b.consentLocation === true, dataUse: true, givenAt: new Date() },
    });
    await repo.linkUser(user._id, patient._id);
    return { patientId };
  } catch (e) {
    await repo.removeUser(user._id).catch(() => {});
    throw e;
  }
}

// ---- own record ------------------------------------------------------------------------------------------------

export async function getOwn(user) { return presentPatient(await load(user.patientId)); }

export async function updatePersonal(user, v) {
  const p = await load(user.patientId);
  const set = {}; const unset = {};
  for (const [k, val] of Object.entries(v)) (val === undefined ? unset : set)[k] = val ?? 1;
  const next = await commit(p, { set, unset });
  await logEdit(user, p, 'personal', 'update');
  return presentPatient(next);
}

export async function updatePreferences(user, v) {
  const p = await load(user.patientId);
  const set = {};
  for (const k of ['email', 'webPush', 'whatsapp']) if (v[k] !== undefined) set[`notificationPreferences.${k}`] = v[k];
  if (v.locationConsent !== undefined) set['consent.location'] = v.locationConsent;
  const next = await commit(p, { set });
  await logEdit(user, p, 'preferences', 'update');
  return presentPatient(next);
}

// ---- medical sections (features 13-18) -------------------------------------------------------------------------

const hospitalOwned = (section, item) => section === 'hospitalizations' && item.dischargeSummaryId;
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, x]) => x !== undefined));

export async function addItem(user, section, v) {
  const p = await load(user.patientId);
  const list = p[section] ?? [];
  if (list.length >= SECTION_LIMIT) throw err(409, `You can keep at most ${SECTION_LIMIT} entries here`, 'SECTION_FULL');
  const next = await commit(p, { set: { [section]: [...list, { _id: newId(), ...clean(v) }] } });
  await logEdit(user, p, section, 'add');
  return presentPatient(next);
}

function findItem(p, section, itemId) {
  const item = (p[section] ?? []).find((x) => sid(x._id) === sid(itemId));
  if (!item) throw err(404, 'Entry not found', 'NOT_FOUND');
  if (hospitalOwned(section, item)) throw err(403, 'A hospital added this entry, so it cannot be changed here', 'HOSPITAL_ENTRY');
  return item;
}

export async function updateItem(user, section, itemId, v) {
  const p = await load(user.patientId);
  const item = findItem(p, section, itemId);
  const merged = { ...item };
  for (const [k, val] of Object.entries(v)) { if (val === undefined) delete merged[k]; else merged[k] = val; } // blank = clear the field
  if (section === 'hospitalizations' && merged.admittedOn && merged.dischargedOn && new Date(merged.dischargedOn) < new Date(merged.admittedOn)) throw invalid({ dischargedOn: 'Discharge cannot be before admission' });
  const next = await commit(p, { set: { [section]: p[section].map((x) => (sid(x._id) === sid(itemId) ? merged : x)) } });
  await logEdit(user, p, section, 'update');
  return presentPatient(next);
}

export async function deleteItem(user, section, itemId) {
  const p = await load(user.patientId);
  findItem(p, section, itemId);
  const next = await commit(p, { set: { [section]: p[section].filter((x) => sid(x._id) !== sid(itemId)) } });
  await logEdit(user, p, section, 'delete');
  return presentPatient(next);
}

// ---- emergency contacts (feature 9) ----------------------------------------------------------------------------

export async function addContact(user, v) {
  const p = await load(user.patientId);
  const list = p.emergencyContacts ?? [];
  if (list.length >= 3) throw err(409, 'You can have at most 3 emergency contacts', 'CONTACT_LIMIT');
  const used = new Set(list.map((c) => c.priority));
  let priority = v.priority;
  if (priority && used.has(priority)) throw err(409, `Priority ${priority} is already used by another contact`, 'PRIORITY_TAKEN');
  priority ??= [1, 2, 3].find((n) => !used.has(n));
  const { priority: _ignored, ...data } = v;
  const next = await commit(p, { set: { emergencyContacts: [...list, { _id: newId(), ...clean(data), priority }] } });
  await logEdit(user, p, 'emergencyContacts', 'add');
  return presentPatient(next);
}

export async function updateContact(user, contactId, v) {
  const p = await load(user.patientId);
  if (!(p.emergencyContacts ?? []).some((c) => sid(c._id) === sid(contactId))) throw err(404, 'Contact not found', 'NOT_FOUND');
  const list = p.emergencyContacts.map((c) => {
    if (sid(c._id) !== sid(contactId)) return c;
    const m = { ...c };
    for (const [k, val] of Object.entries(v)) { if (val === undefined) delete m[k]; else m[k] = val; }
    return m;
  });
  const next = await commit(p, { set: { emergencyContacts: list } });
  await logEdit(user, p, 'emergencyContacts', 'update');
  return presentPatient(next);
}

export async function deleteContact(user, contactId) {
  const p = await load(user.patientId);
  if (!(p.emergencyContacts ?? []).some((c) => sid(c._id) === sid(contactId))) throw err(404, 'Contact not found', 'NOT_FOUND');
  const next = await commit(p, { set: { emergencyContacts: p.emergencyContacts.filter((c) => sid(c._id) !== sid(contactId)) } });
  await logEdit(user, p, 'emergencyContacts', 'delete');
  return presentPatient(next);
}

/** `order` must list each current contact exactly once; priority becomes the position. */
export async function reorderContacts(user, order) {
  const p = await load(user.patientId);
  const have = (p.emergencyContacts ?? []).map((c) => sid(c._id));
  if (order.length !== have.length || !order.every((id) => have.includes(sid(id)))) throw err(409, 'The list must include each of your contacts exactly once', 'ORDER_MISMATCH');
  const list = order.map((id, i) => ({ ...p.emergencyContacts.find((c) => sid(c._id) === sid(id)), priority: i + 1 }));
  const next = await commit(p, { set: { emergencyContacts: list } });
  await logEdit(user, p, 'emergencyContacts', 'reorder');
  return presentPatient(next);
}

/** "Send test alert": no email service is connected, so this returns a pre-filled WhatsApp link. 3 per hour per contact. */
export async function testAlert(user, contactId) {
  const p = await load(user.patientId);
  const c = (p.emergencyContacts ?? []).find((x) => sid(x._id) === sid(contactId));
  if (!c) throw err(404, 'Contact not found', 'NOT_FOUND');
  const q = consumeQuota(`testalert:${sid(c._id)}`, env.testAlertsPerContactPerHour, HOUR);
  if (!q.allowed) throw Object.assign(err(429, `You can send ${env.testAlertsPerContactPerHour} test alerts per hour to each contact. Try again in ${Math.ceil(q.retryAfterSeconds / 60)} minutes.`, 'RATE_LIMITED'), { retryAfter: q.retryAfterSeconds });
  const message = `This is a TEST from HealthTwin AI (demonstration project). ${p.fullName} listed you as an emergency contact. No emergency is happening.`;
  await repo.writeAudit({ actor: user.id, action: 'contact.test_alert', resourceType: 'patient', resourceRef: p.patientId });
  return { whatsappUrl: `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, remainingThisHour: Math.max(0, env.testAlertsPerContactPerHour - q.count) };
}

// ---- photo (feature 8) and documents (feature 19) --------------------------------------------------------------

/** Decides the real type from the first bytes (the name and any MIME header are ignored) and strips image metadata. */
export function checkedFile(buffer, allowedKinds, label) {
  const type = detectFileType(buffer);
  if (!type || !allowedKinds.includes(type.kind)) throw err(400, `${label} must be ${allowedKinds.map((k) => k.toUpperCase()).join(', ')} (checked from the file contents)`, 'INVALID_FILE_TYPE');
  try { return { type, data: sanitizeUpload(buffer, type) }; } catch (e) {
    if (e instanceof InvalidImageError) throw err(400, 'That image file is damaged or not valid', 'INVALID_FILE');
    throw e;
  }
}

export async function savePhoto(user, body) {
  const up = validateUpload(body, { needsType: false, maxBytes: env.photoMaxBytes });
  const { type, data } = checkedFile(up.buffer, ['jpeg', 'png'], 'A photo');
  const p = await load(user.patientId);
  const storedName = await saveFile('photos', data, type.ext);
  const next = await commit(p, { set: { photoFile: storedName } }).catch(async (e) => { await deleteStored('photos', storedName); throw e; });
  if (p.photoFile) await deleteStored('photos', p.photoFile);
  await logEdit(user, p, 'photo', 'update');
  return presentPatient(next);
}

export async function deletePhoto(user) {
  const p = await load(user.patientId);
  if (!p.photoFile) return presentPatient(p);
  const next = await commit(p, { unset: { photoFile: 1 } });
  await deleteStored('photos', p.photoFile);
  await logEdit(user, p, 'photo', 'delete');
  return presentPatient(next);
}

export const mimeFor = (name) => (name.endsWith('.png') ? 'image/png' : name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

export async function getPhoto(user) {
  const p = await load(user.patientId);
  if (!p.photoFile) throw err(404, 'No photo', 'NOT_FOUND');
  return { mime: mimeFor(p.photoFile), data: await readStored('photos', p.photoFile) };
}

const cleanName = (n) => String(n ?? 'document').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 120) || 'document';
const presentDoc = (d) => ({ id: sid(d._id), type: d.type, originalName: d.originalName, mimeType: d.mimeType, size: d.size, uploadedAt: d.uploadedAt });

export async function uploadDocument(user, body) {
  const up = validateUpload(body, { needsType: true, maxBytes: env.documentMaxBytes });
  const { type, data } = checkedFile(up.buffer, ['pdf', 'jpeg', 'png'], 'A document');
  const p = await load(user.patientId);
  if ((await repo.countDocuments(p._id)) >= env.maxDocumentsPerPatient) throw err(409, `You can keep at most ${env.maxDocumentsPerPatient} documents. Delete one to add another.`, 'DOCUMENT_LIMIT');
  const storedName = await saveFile('documents', data, type.ext);
  try {
    const doc = await repo.createDocument({ patient: p._id, type: up.type, originalName: cleanName(up.name), storedName, mimeType: type.mime, size: data.length });
    await logEdit(user, p, 'documents', 'add');
    return presentDoc(doc);
  } catch (e) { await deleteStored('documents', storedName).catch(() => {}); throw e; }
}

export async function listDocuments(user) { return (await repo.listDocuments(user.patientId)).map(presentDoc); }

export async function getDocument(user, docId) {
  const doc = await repo.findDocument(user.patientId, docId);
  if (!doc) throw err(404, 'Document not found', 'NOT_FOUND');
  return { mime: doc.mimeType, name: doc.originalName, data: await readStored('documents', doc.storedName) };
}

export async function deleteDocument(user, docId) {
  const p = await load(user.patientId);
  const doc = await repo.deleteDocument(p._id, docId);
  if (!doc) throw err(404, 'Document not found', 'NOT_FOUND');
  await deleteStored('documents', doc.storedName);
  await logEdit(user, p, 'documents', 'delete');
  return { deleted: true };
}

// ---- QR passport, owner side (feature 20) ----------------------------------------------------------------------

export const passportUrl = (token) => `${env.clientUrl.replace(/\/$/, '')}/p/${token}`;

export async function getQr(user) {
  const p = await load(user.patientId);
  if (!p.qrToken) return regenerateQr(user);
  return { url: passportUrl(p.qrToken), rotatedAt: p.qrRotatedAt ?? null };
}

/** Replaces the token in one update; the old link stops working the moment this returns. */
export async function regenerateQr(user) {
  const p = await load(user.patientId);
  const qrToken = newQrToken();
  const rotatedAt = new Date();
  await commit(p, { set: { qrToken, qrRotatedAt: rotatedAt } });
  await repo.writeAudit({ actor: user.id, action: 'qr.regenerate', resourceType: 'patient', resourceRef: p.patientId });
  return { url: passportUrl(qrToken), rotatedAt };
}

// ---- QR passport, scanner side (features 20, 106) --------------------------------------------------------------

/** Malformed, unknown and revoked tokens all end here, so the answer never reveals which case it was. */
const notFound = () => err(404, 'This passport link is not valid', 'PASSPORT_NOT_FOUND');
async function byToken(token) {
  if (!TOKEN.test(String(token))) throw notFound();
  const p = await repo.findByQrToken(token);
  if (!p) throw notFound();
  return p;
}

export async function scan(token) {
  const p = await byToken(token);
  await repo.writeAudit({ action: 'passport.scan', resourceType: 'patient', resourceRef: p.patientId });
  const s = emergencySummary(p);
  return { ...s, photoUrl: s.hasPhoto ? `/api/passport/${token}/photo` : null };
}

export async function scanPhoto(token) {
  const p = await byToken(token);
  if (!p.photoFile) throw notFound();
  return { mime: mimeFor(p.photoFile), data: await readStored('photos', p.photoFile) };
}

/** One tap from a bystander. Records the report and announces it; it does NOT create an emergency case (that is the SOS flow). */
export async function bystanderReport(token, v, ip) {
  const p = await byToken(token);
  const a = consumeQuota(`bystander:ip:${ip}`, env.bystanderPerIpPerHour, HOUR);
  if (!a.allowed) throw Object.assign(err(429, 'Too many reports from this device. If this is an emergency, call 112 or 108 now.', 'RATE_LIMITED'), { retryAfter: a.retryAfterSeconds });
  const b = consumeQuota(`bystander:patient:${sid(p._id)}`, env.bystanderPerPatientPerHour, HOUR);
  if (!b.allowed) throw Object.assign(err(429, 'This person has already been reported recently. If this is an emergency, call 112 or 108 now.', 'RATE_LIMITED'), { retryAfter: b.retryAfterSeconds });
  const location = clean({ latitude: v.latitude, longitude: v.longitude, accuracyMeters: v.accuracyMeters });
  const doc = await repo.createReport({ patient: p._id, location });
  await repo.writeAudit({ action: 'passport.bystander_report', resourceType: 'patient', resourceRef: p.patientId, meta: { reportId: sid(doc._id) } });
  patientEvents.emit(PATIENT_EVENTS.BYSTANDER_REPORT, { reportId: sid(doc._id), patient: sid(p._id), patientId: p.patientId, location, reportedAt: doc.reportedAt ?? new Date() });
  return { received: true, reportId: sid(doc._id) };
}

/** Hospital logins only. The view is written to the audit log first; no log entry, no record. */
export async function fullRecord(token, actor) {
  const p = await byToken(token);
  await repo.writeAudit({ actor: actor.id, action: 'record.view', resourceType: 'patient', resourceRef: p.patientId, meta: { role: actor.role, hospitalId: actor.hospitalId } });
  const docs = (await repo.listDocuments(p._id)).map(presentDoc);
  const o = presentPatient(p);
  return { ...o, photoUrl: p.photoFile ? `/api/passport/${token}/photo` : null, documents: docs };
}

export async function fullRecordDocument(token, docId, actor) {
  const p = await byToken(token);
  const doc = await repo.findDocument(p._id, docId);
  if (!doc) throw err(404, 'Document not found', 'NOT_FOUND');
  await repo.writeAudit({ actor: actor.id, action: 'record.view', resourceType: 'document', resourceRef: p.patientId, meta: { documentId: sid(doc._id), role: actor.role } });
  return { mime: doc.mimeType, name: doc.originalName, data: await readStored('documents', doc.storedName) };
}
