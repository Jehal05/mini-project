// Gives Daksh's simulation and detection code the patient shape it was written for, read from OUR Patient model.
// It reads `patientCode`, `name`, `conditions`, `cardiacConditions`, `familyHistory`, `dateOfBirth`, `bloodGroup`, `city`.
import mongoose from 'mongoose';
import { Patient as PatientModel } from '../models/index.js';

/** Our patient document -> the shape the monitoring code reads. */
export function toSimPatient(p) {
  if (!p) return p;
  return {
    _id: p._id,
    patientCode: p.patientId,
    name: p.fullName ?? p.name,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    bloodGroup: p.bloodGroup,
    city: p.city,
    cardiacConditions: p.cardiacConditions ?? [],
    conditions: p.medicalConditions ?? [],
    familyHistory: (p.familyHistory ?? []).map((f) => ({ relative: f.relative, condition: f.condition })),
    allergies: p.allergies?.map((a) => a.allergen),
    medications: p.medications?.map((m) => m.drug),
    emergencyContacts: p.emergencyContacts ?? [],
  };
}

const translate = (q = {}) => {
  const out = { ...q };
  if ('patientCode' in out) { out.patientId = out.patientCode; delete out.patientCode; }
  return out;
};
const sortKey = (s = {}) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k === 'patientCode' ? 'patientId' : k, v]));

function chain(query) {
  const api = {
    sort(s) { query = query.sort(sortKey(s)); return api; },
    async lean() { const r = await query.lean(); return Array.isArray(r) ? r.map(toSimPatient) : toSimPatient(r); },
  };
  return api;
}

export const Patient = {
  find: (q) => chain(PatientModel.find(translate(q))),
  findOne: (q) => chain(PatientModel.findOne(translate(q))),
  findById: (id) => (mongoose.isValidObjectId(id) ? chain(PatientModel.findById(id)) : { lean: async () => null }),
};
export default Patient;
