// In-memory stand-in for src/hospitalmgmt/repo.js.
export const db = { hospitals: new Map(), doctors: [], bays: [], cases: [], patients: [], beds: [], audit: [], ambulances: 0 };
export const resetMgmt = () => { Object.assign(db, { hospitals: new Map(), doctors: [], bays: [], cases: [], patients: [], beds: [], audit: [], ambulances: 0 }); };
let n = 90000;
const id = () => (++n).toString(16).padStart(24, '0');
const sid = String;
const clone = (v) => (v == null ? v : structuredClone(v));
const dup = () => Object.assign(new Error('dup'), { code: 11000 });
const mine = (rows, h) => rows.filter((r) => sid(r.hospital) === sid(h));

export const getHospital = async (h) => clone(db.hospitals.get(sid(h)));
export const updateHospital = async (h, set) => {
  const row = db.hospitals.get(sid(h)); if (!row) return null;
  for (const [k, v] of Object.entries(set)) { if (k === 'capabilities.cathLab') (row.capabilities ??= {}).cathLab = v; else row[k] = v; }
  return clone(row);
};
export const setCardiologistFlag = async (h, on) => { const row = db.hospitals.get(sid(h)); if (row) (row.capabilities ??= {}).cardiologistOnDuty = on; };
export const listDoctors = async (h) => clone(mine(db.doctors, h));
export const findDoctor = async (h, i) => clone(mine(db.doctors, h).find((d) => sid(d._id) === sid(i)));
export const createDoctor = async (data) => {
  if (mine(db.doctors, data.hospital).some((d) => d.name === data.name)) throw dup();
  const row = { _id: id(), ...data }; db.doctors.push(row); return clone(row);
};
export const updateDoctor = async (h, i, set) => {
  const d = mine(db.doctors, h).find((x) => sid(x._id) === sid(i)); if (!d) return null;
  if (set.name && mine(db.doctors, h).some((x) => x !== d && x.name === set.name)) throw dup();
  Object.assign(d, set); return clone(d);
};
export const cardiologistOnDuty = async (h) => mine(db.doctors, h).some((d) => d.specialty === 'cardiologist' && d.onDuty && d.isActive !== false);
export const countDoctorsOnDuty = async (h) => mine(db.doctors, h).filter((d) => d.onDuty && d.isActive !== false).length;
export const bedCounts = async (h) => {
  const out = new Map();
  for (const b of mine(db.beds, h)) { const k = `${b.ward}|${b.status}`; out.set(k, (out.get(k) ?? 0) + 1); }
  return [...out].map(([k, c]) => { const [ward, status] = k.split('|'); return { _id: { ward, status }, n: c }; });
};
export const countAvailableAmbulances = async () => db.ambulances;
export const countActiveAdmissions = async () => 0;
export const countIncoming = async (h) => db.cases.filter((c) => !c.hospital && c.status === 'pending' && (c.notifiedHospitals ?? []).some((x) => sid(x.hospital) === sid(h)) && !(c.rejectedHospitals ?? []).some((x) => sid(x) === sid(h))).length;
export const countHandling = async (h) => db.cases.filter((c) => sid(c.hospital) === sid(h) && ['accepted', 'ambulance_assigned', 'en_route', 'arrived'].includes(c.status)).length;
export const recentAccepted = async (h) => clone(db.cases.filter((c) => sid(c.hospital) === sid(h) && c.acceptedAt));
export const listBays = async (h) => clone(mine(db.bays, h).sort((a, b) => a.label.localeCompare(b.label)));
export const countBays = async (h) => mine(db.bays, h).length;
export const createBay = async (data) => {
  if (mine(db.bays, data.hospital).some((b) => b.label === data.label)) throw dup();
  const row = { _id: id(), status: 'vacant', ...data }; db.bays.push(row); return clone(row);
};
export const findBay = async (h, i) => clone(mine(db.bays, h).find((b) => sid(b._id) === sid(i)));
export const moveBay = async (h, i, from, update) => {
  const b = mine(db.bays, h).find((x) => sid(x._id) === sid(i) && x.status === from); if (!b) return null;
  Object.assign(b, update.$set ?? {}); for (const k of Object.keys(update.$unset ?? {})) delete b[k];
  return clone(b);
};
export const deleteBay = async (h, i) => {
  const k = db.bays.findIndex((b) => sid(b._id) === sid(i) && sid(b.hospital) === sid(h) && b.status === 'vacant');
  if (k < 0) return false; db.bays.splice(k, 1); return true;
};
export const findPatientByPatientId = async (pid) => clone(db.patients.find((p) => p.patientId === pid));
export const listArriving = async (h) => clone(db.cases.filter((c) => sid(c.hospital) === sid(h) && ['accepted', 'ambulance_assigned', 'en_route'].includes(c.status)));
export const patientsByIds = async (ids) => clone(db.patients.filter((p) => ids.some((x) => sid(x) === sid(p._id))));
export const listCases = async (filter, { skip, limit }) => {
  // The fake understands only the hospital id inside the filter; tests assert the filter shape separately via logic.js.
  const h = filter['notifiedHospitals.hospital'];
  return clone(db.cases.filter((c) => (c.notifiedHospitals ?? []).some((x) => sid(x.hospital) === sid(h))).slice(skip, skip + limit));
};
export const countCases = async (filter) => (await listCases(filter, { skip: 0, limit: 1e9 })).length;
export const writeAudit = async (e) => { db.audit.push(e); };
