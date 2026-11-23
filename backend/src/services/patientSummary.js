import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { Document } from '../models/Document.js';
import { Patient } from '../models/Patient.js';

/** Feature 16: a medication counts as a blood thinner if flagged by hand OR its name is on the configured list. */
export function isBloodThinner(med) {
  if (med?.isBloodThinner) return true;
  const name = String(med?.drug ?? '').toLowerCase();
  return config.bloodThinnerDrugs.some((drug) => new RegExp(`\\b${drug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(name));
}

const photoVersion = (storedName) => crypto.createHash('sha256').update(String(storedName)).digest('hex').slice(0, 8);

/** The patient's own record, as sent to the patient: no internal ids, no QR token, blood thinners resolved. */
export function presentPatient(patient) {
  const o = patient.toJSON();
  delete o.user;
  delete o.qrToken;
  delete o.qrRotatedAt;
  o.hasPhoto = Boolean(patient.photoUrl);
  o.photoUrl = patient.photoUrl ? `/api/patients/me/photo?v=${photoVersion(patient.photoUrl)}` : null;
  o.medications = (o.medications ?? []).map((m) => ({ ...m, isBloodThinner: isBloodThinner(m) }));
  o.emergencyContacts = [...(o.emergencyContacts ?? [])].sort((a, b) => a.priority - b.priority);
  return o;
}

/**
 * Feature 20 emergency tier: the ONLY facts a stranger who scans the QR can see.
 * Reusable by the hospital flow: pass a Patient document, a Patient _id, or an "HT-2026-0001" id.
 * Fields: patientId, bloodGroup, hasPhoto, severeAllergies [{allergen, reaction}], cardiacHistory [{type, year}],
 * emergencyContact {name, relation, phone} (the lowest priority number). Nothing else, by design.
 */
export async function getEmergencySummary(patientOrId) {
  let patient = patientOrId;
  if (!patient?.patientId) {
    patient = /^HT-\d{4}-\d{4,}$/.test(String(patientOrId))
      ? await Patient.findOne({ patientId: patientOrId })
      : await Patient.findById(patientOrId);
  }
  if (!patient) return null;
  const contact = [...patient.emergencyContacts].sort((a, b) => a.priority - b.priority)[0];
  return {
    patientId: patient.patientId,
    bloodGroup: patient.bloodGroup ?? null,
    hasPhoto: Boolean(patient.photoUrl),
    severeAllergies: patient.allergies.filter((a) => a.severity === 'severe').map((a) => ({ allergen: a.allergen, reaction: a.reaction ?? null })),
    cardiacHistory: patient.cardiacConditions.map((c) => ({ type: c.type, year: c.year ?? null })),
    emergencyContact: contact ? { name: contact.name, relation: contact.relation, phone: contact.phone } : null,
  };
}

/** The full record a hospital login may read after scanning a passport. */
export async function getFullRecord(patient, { photoPath }) {
  const o = presentPatient(patient);
  delete o.photoUrl;
  o.photoUrl = patient.photoUrl ? photoPath : null;
  const documents = await Document.find({ patient: patient._id }).sort({ uploadedAt: -1 });
  return { ...o, documents: documents.map((d) => d.toJSON()) };
}
