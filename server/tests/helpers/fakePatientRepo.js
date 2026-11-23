// In-memory stand-in for src/patients/patientRepo.js, including the optimistic "only if unchanged" save.
import { oid } from './fakeDb.js';
import { store as authStore } from './fakeAuthRepo.js';

export const db = { patients: new Map(), docs: [], reports: [], audit: [], seq: {} };
let n = 9000;
export const resetPatients = () => { db.patients = new Map(); db.docs = []; db.reports = []; db.audit = []; db.seq = {}; };
const clone = (v) => (v == null ? v : structuredClone(v));
const sid = String;

export const nextPatientSeq = async (year) => (db.seq[year] = (db.seq[year] ?? 0) + 1);
export const createPatient = async (data) => {
  const row = { _id: oid(++n), emergencyContacts: [], cardiacConditions: [], medicalConditions: [], allergies: [], medications: [], hospitalizations: [], familyHistory: [], notificationPreferences: { email: true, webPush: true, whatsapp: true }, ...data, createdAt: new Date(), updatedAt: new Date(++n) };
  db.patients.set(row._id, row);
  return clone(row);
};
export const findPatient = async (id) => clone(db.patients.get(sid(id)));
export const findByQrToken = async (t) => clone([...db.patients.values()].find((p) => p.qrToken === t));
export const linkUser = async (userId, patientId) => { const u = authStore.users.get(sid(userId)); if (u) u.patient = patientId; };
export const removeUser = async (userId) => { authStore.users.delete(sid(userId)); };

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { o[k] ??= {}; o = o[k]; });
  o[keys.at(-1)] = value;
}
export const savePatient = async (id, expectedUpdatedAt, { set = {}, unset = {} } = {}) => {
  const p = db.patients.get(sid(id));
  if (!p || +p.updatedAt !== +expectedUpdatedAt) return null;
  for (const [k, v] of Object.entries(set)) setPath(p, k, structuredClone(v));
  for (const k of Object.keys(unset)) delete p[k];
  p.updatedAt = new Date(++n);
  return clone(p);
};

export const countDocuments = async (patient) => db.docs.filter((d) => sid(d.patient) === sid(patient)).length;
export const createDocument = async (data) => { const row = { _id: oid(++n), uploadedAt: new Date(), ...data }; db.docs.push(row); return clone(row); };
export const listDocuments = async (patient) => clone(db.docs.filter((d) => sid(d.patient) === sid(patient)));
export const findDocument = async (patient, id) => clone(db.docs.find((d) => sid(d._id) === sid(id) && sid(d.patient) === sid(patient)));
export const deleteDocument = async (patient, id) => { const i = db.docs.findIndex((d) => sid(d._id) === sid(id) && sid(d.patient) === sid(patient)); return i < 0 ? null : db.docs.splice(i, 1)[0]; };
export const createReport = async (data) => { const row = { _id: oid(++n), reportedAt: new Date(), status: 'pending', ...data }; db.reports.push(row); return clone(row); };
export const writeAudit = async (e) => { db.audit.push(e); };
