// In-memory stand-in for src/inpatient/repo.js. Each conditional update checks and changes in one synchronous step,
// like a single MongoDB findOneAndUpdate. (It tests our logic; MongoDB's atomicity is what makes it safe in production.)
import { db as pdb } from './fakePatientRepo.js';
import { store as authStore } from './fakeAuthRepo.js';

export const db = { beds: [], admissions: [], records: [], rx: [], summaries: [], doctors: [], hospitals: new Map(), audit: [] };
let n = 70000;
export const resetInpatient = () => { Object.assign(db, { beds: [], admissions: [], records: [], rx: [], summaries: [], doctors: [], hospitals: new Map(), audit: [] }); };
const id = () => (++n).toString(16).padStart(24, '0');
const clone = (v) => (v == null ? v : structuredClone(v));
const sid = String;
const patientRow = (p) => p && { _id: p._id, patientId: p.patientId, fullName: p.fullName, bloodGroup: p.bloodGroup, dateOfBirth: p.dateOfBirth, allergies: clone(p.allergies ?? []) };

export const findPatientByPatientId = async (pid) => patientRow([...pdb.patients.values()].find((p) => p.patientId === pid));
export const findPatientById = async (i) => patientRow(pdb.patients.get(sid(i)));
export const hospitalName = async (i) => db.hospitals.get(sid(i));
export const listDoctors = async (hospital) => clone(db.doctors.filter((d) => sid(d.hospital) === sid(hospital)));
export const findDoctor = async (hospital, i) => clone(db.doctors.find((d) => sid(d._id) === sid(i) && sid(d.hospital) === sid(hospital)));

export const listBeds = async (hospital) => clone(db.beds.filter((b) => sid(b.hospital) === sid(hospital)).sort((a, b) => a.ward.localeCompare(b.ward) || a.label.localeCompare(b.label)));
export const findBed = async (hospital, i) => clone(db.beds.find((b) => sid(b._id) === sid(i) && sid(b.hospital) === sid(hospital)));
export const createBed = async (data) => {
  if (db.beds.some((b) => sid(b.hospital) === sid(data.hospital) && b.label === data.label)) throw Object.assign(new Error('dup'), { code: 11000 });
  const row = { _id: id(), statusChangedAt: new Date(), ...data }; db.beds.push(row); return clone(row);
};
export const deleteBed = async (hospital, i) => {
  const k = db.beds.findIndex((b) => sid(b._id) === sid(i) && sid(b.hospital) === sid(hospital) && b.status !== 'occupied');
  if (k < 0) return false; db.beds.splice(k, 1); return true;
};
export const moveBed = async (hospital, i, from, to, extra = {}) => {
  const b = db.beds.find((x) => sid(x._id) === sid(i) && sid(x.hospital) === sid(hospital) && from.includes(x.status));
  if (!b) return null;
  Object.assign(b, { status: to, statusChangedAt: new Date() }, extra.set ?? {});
  for (const k of Object.keys(extra.unset ?? {})) delete b[k];
  return clone(b);
};

export const openAdmissionFor = async (patient) => clone(db.admissions.find((a) => sid(a.patient) === sid(patient) && a.status === 'admitted'));
export const createAdmission = async (data) => {
  if (db.admissions.some((a) => sid(a.patient) === sid(data.patient) && a.status === 'admitted')) throw Object.assign(new Error('dup'), { code: 11000 });
  const row = { _id: id(), ...data }; db.admissions.push(row); return clone(row);
};
export const findAdmission = async (hospital, i) => clone(db.admissions.find((a) => sid(a._id) === sid(i) && sid(a.hospital) === sid(hospital)));
export const listAdmissions = async (hospital, status) => clone(db.admissions.filter((a) => sid(a.hospital) === sid(hospital) && a.status === status));
export const updateAdmission = async (i, set) => { const a = db.admissions.find((x) => sid(x._id) === sid(i)); Object.assign(a, set); return clone(a); };
export const closeAdmission = async (hospital, i) => {
  const a = db.admissions.find((x) => sid(x._id) === sid(i) && sid(x.hospital) === sid(hospital) && x.status === 'admitted');
  if (!a) return null; a.status = 'discharged'; a.dischargedAt = new Date(); return clone(a);
};
export const reopenAdmission = async (i) => { const a = db.admissions.find((x) => sid(x._id) === sid(i)); a.status = 'admitted'; delete a.dischargedAt; };

export const addRecord = async (data) => { const row = { _id: id(), createdAt: new Date(++n), ...data }; db.records.push(row); return clone(row); };
export const listRecords = async (admission) => clone(db.records.filter((r) => sid(r.admission) === sid(admission)).sort((a, b) => b.createdAt - a.createdAt));
export const countRecords = async (admission) => db.records.filter((r) => sid(r.admission) === sid(admission)).length;

export const addPrescription = async (data) => { const row = { _id: id(), createdAt: new Date(++n), ...data }; db.rx.push(row); return clone(row); };
export const listPrescriptions = async (admission) => clone(db.rx.filter((r) => sid(r.admission) === sid(admission)).sort((a, b) => b.createdAt - a.createdAt));

export const findSummary = async (admission) => clone(db.summaries.find((s) => sid(s.admission) === sid(admission)));
export const createSummary = async (data) => {
  if (db.summaries.some((s) => sid(s.admission) === sid(data.admission))) throw Object.assign(new Error('dup'), { code: 11000 });
  const row = { _id: id(), ...data }; db.summaries.push(row); return clone(row);
};
export const appendHospitalization = async (patient, summaryId, entry) => {
  const p = pdb.patients.get(sid(patient));
  if (p && !p.hospitalizations.some((h) => sid(h.dischargeSummaryId) === sid(summaryId))) p.hospitalizations.push({ _id: id(), ...entry, dischargeSummaryId: summaryId });
};
export const writeAudit = async (data) => { db.audit.push(data); };
export const userName = async (i) => authStore.users.get(sid(i))?.name ?? 'Staff';
