import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { config } from '../config/env.js';
import { BystanderReport } from '../models/BystanderReport.js';
import { Document } from '../models/Document.js';
import { Patient } from '../models/Patient.js';
import { EVENTS, appEvents } from '../events.js';
import { getEmergencySummary, getFullRecord } from '../services/patientSummary.js';
import { consumeQuota } from '../utils/quota.js';
import { readFile } from '../utils/storage.js';
import { mimeFor, setFileHeaders } from './profile.controller.js';

const HOUR = 60 * 60 * 1000;
const TOKEN = /^[a-f0-9]{64}$/;

/** Malformed, unknown and revoked tokens all end here, so the answer never reveals which case it was. */
const passportNotFound = () => new ApiError(404, 'PASSPORT_NOT_FOUND', 'This passport link is not valid');

async function patientByToken(token) {
  if (!TOKEN.test(String(token))) throw passportNotFound();
  const patient = await Patient.findOne({ qrToken: token });
  if (!patient) throw passportNotFound();
  return patient;
}

/** Public: the emergency tier only (feature 20). Audited by patient ID, never by the token. */
export async function scan(req, res) {
  const patient = await patientByToken(req.params.token);
  const summary = await getEmergencySummary(patient);
  await writeAudit({ req, action: 'passport.scan', resourceType: 'patient', resourceId: patient.patientId, hospitalId: null });
  res.set('Cache-Control', 'private, no-store');
  res.json({ passport: { ...summary, photoUrl: summary.hasPhoto ? `/api/passport/${req.params.token}/photo` : null } });
}

export async function scanPhoto(req, res) {
  const patient = await patientByToken(req.params.token);
  if (!patient.photoUrl) throw passportNotFound();
  setFileHeaders(res, mimeFor(patient.photoUrl));
  res.send(await readFile('photos', patient.photoUrl));
}

/** Feature 106: one tap from a bystander. Records the report and announces it; it does NOT create an EmergencyCase. */
export async function report(req, res) {
  const patient = await patientByToken(req.params.token);

  const ip = await consumeQuota(`bystander:ip:${req.ip}`, config.bystander.perIpPerHour, HOUR);
  if (!ip.allowed) {
    res.set('Retry-After', String(ip.retryAfterSeconds));
    throw ApiError.tooMany('Too many reports from this device. If this is an emergency, call 112 or 108 now.');
  }
  const perPatient = await consumeQuota(`bystander:patient:${patient._id}`, config.bystander.perPatientPerHour, HOUR);
  if (!perPatient.allowed) {
    res.set('Retry-After', String(perPatient.retryAfterSeconds));
    throw ApiError.tooMany('This person has already been reported recently. If this is an emergency, call 112 or 108 now.');
  }

  const { latitude, longitude, accuracyMeters } = req.valid;
  const doc = await BystanderReport.create({
    patient: patient._id,
    location: { latitude, longitude, ...(accuracyMeters !== undefined && { accuracyMeters }) },
    reporterIp: req.ip,
  });
  await writeAudit({ req, action: 'passport.bystander_report', resourceType: 'patient', resourceId: patient.patientId, meta: { reportId: String(doc._id) } });
  appEvents.emit(EVENTS.BYSTANDER_REPORT, {
    reportId: String(doc._id),
    patient: String(patient._id),
    patientId: patient.patientId,
    location: { latitude, longitude, ...(accuracyMeters !== undefined && { accuracyMeters }) },
    reportedAt: doc.reportedAt,
  });
  res.status(202).json({ received: true, reportId: String(doc._id) });
}

/** Hospital logins only. The view is written to the audit log first; no log entry, no record. */
export async function fullRecord(req, res) {
  const patient = await patientByToken(req.params.token);
  await writeAudit({ req, action: 'record.view', resourceType: 'patient', resourceId: patient.patientId, strict: true });
  const record = await getFullRecord(patient, { photoPath: `/api/passport/${req.params.token}/photo` });
  res.set('Cache-Control', 'private, no-store');
  res.json({ patient: record });
}

export async function fullRecordDocument(req, res) {
  const patient = await patientByToken(req.params.token);
  const doc = await Document.findOne({ _id: req.params.docId, patient: patient._id });
  if (!doc) throw ApiError.notFound('Document not found');
  await writeAudit({ req, action: 'record.view', resourceType: 'document', resourceId: patient.patientId, meta: { documentId: String(doc._id) }, strict: true });
  setFileHeaders(res, doc.mimeType, doc.originalName);
  res.send(await readFile('documents', doc.storedName));
}
