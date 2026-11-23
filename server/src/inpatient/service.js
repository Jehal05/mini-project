// Beds, admissions, visit records, prescriptions and discharge for ONE hospital. Every function takes the signed-in `actor`
// and only ever touches that actor's own hospital (the id comes from the token, never from the request).
import { httpError } from '../utils/httpError.js';
import * as repo from './repo.js';
import { matchingAllergies } from './allergy.js';
import { invalid } from './fields.js';

const err = (status, message, code, extra) => Object.assign(httpError(status, message), { code, ...extra });
const sid = (v) => String(v);
const MAX_RECORDS = 200;

const hospitalOf = (actor) => { if (!actor.hospitalId) throw err(403, 'This account is not linked to a hospital', 'NO_HOSPITAL'); return actor.hospitalId; };
const audit = (actor, action, patientRef, meta) => repo.writeAudit({ actor: actor.id, action, resourceType: 'patient', resourceRef: patientRef, meta: { role: actor.role, hospitalId: actor.hospitalId, ...meta } });

const presentBed = (b) => ({ id: sid(b._id), ward: b.ward, label: b.label, status: b.status, admissionId: b.admission ? sid(b.admission) : null, statusChangedAt: b.statusChangedAt });

// ---- beds (feature 85) ----
export async function listBeds(actor) {
  const beds = (await repo.listBeds(hospitalOf(actor))).map(presentBed);
  const counts = {};
  for (const b of beds) { counts[b.ward] ??= { total: 0, free: 0, occupied: 0, reserved: 0, cleaning: 0 }; counts[b.ward].total += 1; counts[b.ward][b.status] += 1; }
  return { beds, counts };
}
export async function addBed(actor, v) {
  try { return presentBed(await repo.createBed({ hospital: hospitalOf(actor), ward: v.ward, label: v.label, status: 'free' })); } catch (e) {
    if (e?.code === 11000) throw invalid({ label: 'A bed with this label already exists' });
    throw e;
  }
}
export async function setBedState(actor, bedId, status) {
  const h = hospitalOf(actor);
  const bed = await repo.moveBed(h, bedId, ['free', 'reserved', 'cleaning'], status); // an occupied bed changes only by discharging its patient
  if (bed) return presentBed(bed);
  if (!(await repo.findBed(h, bedId))) throw err(404, 'Bed not found', 'NOT_FOUND');
  throw err(409, 'This bed is occupied. It becomes free when the patient is discharged.', 'BED_OCCUPIED');
}
export async function removeBed(actor, bedId) {
  const h = hospitalOf(actor);
  if (await repo.deleteBed(h, bedId)) return { ok: true };
  if (!(await repo.findBed(h, bedId))) throw err(404, 'Bed not found', 'NOT_FOUND');
  throw err(409, 'An occupied bed cannot be removed', 'BED_OCCUPIED');
}

export async function listDoctors(actor) { return (await repo.listDoctors(hospitalOf(actor))).map((d) => ({ id: sid(d._id), name: d.name, specialty: d.specialty })); }

// ---- admissions (feature 84) ----
async function present(a) {
  const [patient, doctor] = await Promise.all([repo.findPatientById(a.patient), a.doctor ? repo.findDoctor(a.hospital, a.doctor) : null]);
  return { id: sid(a._id), patientId: a.patientId ?? patient?.patientId, patientName: patient?.fullName, bloodGroup: patient?.bloodGroup, ward: a.ward ?? null, bedId: a.bed ? sid(a.bed) : null, doctorId: a.doctor ? sid(a.doctor) : null, doctorName: doctor?.name ?? null, reason: a.reason ?? '', status: a.status, admittedAt: a.admittedAt, dischargedAt: a.dischargedAt ?? null };
}

export async function admit(actor, v) {
  const h = hospitalOf(actor);
  const patient = await repo.findPatientByPatientId(v.patientId);
  if (!patient) throw invalid({ patientId: 'No patient with that ID' });
  const doctor = await repo.findDoctor(h, v.doctorId);
  if (!doctor) throw invalid({ doctorId: 'Choose a doctor from this hospital' });
  const open = await repo.openAdmissionFor(patient._id);
  if (open && sid(open.hospital) !== sid(h)) throw err(409, 'This patient is already admitted at another hospital', 'ALREADY_ADMITTED');
  if (open?.bed) throw err(409, 'This patient is already admitted', 'ALREADY_ADMITTED');
  // 1. take the bed: one conditional update, so only one request can win it
  const bed = await repo.moveBed(h, v.bedId, ['free', 'reserved'], 'occupied');
  if (!bed) {
    if (!(await repo.findBed(h, v.bedId))) throw invalid({ bedId: 'Choose a bed from this hospital' });
    throw err(409, 'That bed is not available', 'BED_UNAVAILABLE');
  }
  // 2. admit. An ambulance arrival already made a stay without a bed; it is completed instead of duplicated.
  let admission;
  try {
    const fields = { bed: bed._id, ward: bed.ward, doctor: doctor._id, reason: v.reason, admittedBy: actor.id };
    admission = open ? await repo.updateAdmission(open._id, fields) : await repo.createAdmission({ hospital: h, patient: patient._id, patientId: patient.patientId, ...fields, status: 'admitted', admittedAt: new Date() });
  } catch (e) {
    await repo.moveBed(h, bed._id, ['occupied'], 'free');
    if (e?.code === 11000) throw err(409, 'This patient is already admitted', 'ALREADY_ADMITTED');
    throw e;
  }
  await repo.moveBed(h, bed._id, ['occupied'], 'occupied', { set: { admission: admission._id } });
  await audit(actor, 'admission.create', patient.patientId, { admission: sid(admission._id), ward: bed.ward, bed: bed.label });
  return present(admission);
}

export async function listAdmissions(actor, status = 'admitted') {
  const rows = await repo.listAdmissions(hospitalOf(actor), status === 'discharged' ? 'discharged' : 'admitted');
  return Promise.all(rows.map(present));
}

/** Another hospital's stay looks exactly like a missing one. */
async function own(actor, id, { open = false } = {}) {
  const a = await repo.findAdmission(hospitalOf(actor), id);
  if (!a) throw err(404, 'Admission not found', 'NOT_FOUND');
  if (open && a.status !== 'admitted') throw err(409, 'This patient has been discharged', 'ADMISSION_CLOSED');
  return a;
}
export async function getAdmission(actor, id) { return present(await own(actor, id)); }

// ---- visit records (feature 87) ----
const presentRecord = (r) => ({ id: sid(r._id), kind: r.kind, text: r.text, vitals: r.vitals, authorName: r.authorName, at: r.createdAt });
export async function listRecords(actor, id) {
  const a = await own(actor, id);
  await audit(actor, 'record.view', a.patientId, { view: 'visit_records' });
  return (await repo.listRecords(a._id)).map(presentRecord);
}
export async function addRecord(actor, id, v) {
  const a = await own(actor, id, { open: true });
  if ((await repo.countRecords(a._id)) >= MAX_RECORDS) throw err(409, `One stay can have at most ${MAX_RECORDS} entries`, 'RECORD_LIMIT');
  const { kind, text, ...vitals } = v;
  const rec = await repo.addRecord({ hospital: a.hospital, admission: a._id, kind, author: actor.id, authorName: await repo.userName(actor.id), ...(kind === 'note' ? { text } : { vitals }) });
  await audit(actor, 'record.edit', a.patientId, { section: 'visit_records', op: kind });
  return presentRecord(rec);
}

// ---- prescriptions (feature 88): doctors only (the route enforces it) ----
const presentRx = (p) => ({ id: sid(p._id), drug: p.drug, dose: p.dose, frequency: p.frequency, duration: p.duration, prescriberName: p.prescriberName, allergyOverride: p.allergyOverride?.allergens ?? null, at: p.createdAt });
export async function listPrescriptions(actor, id) {
  const a = await own(actor, id);
  await audit(actor, 'record.view', a.patientId, { view: 'prescriptions' });
  return (await repo.listPrescriptions(a._id)).map(presentRx);
}
export async function checkAllergy(actor, id, drug) {
  const a = await own(actor, id, { open: true });
  const p = await repo.findPatientById(a.patient);
  return { allergens: drug ? matchingAllergies(String(drug).slice(0, 120), p?.allergies ?? []) : [] };
}
export async function prescribe(actor, id, v) {
  const a = await own(actor, id, { open: true });
  const { acknowledgeAllergy, ...data } = v;
  const p = await repo.findPatientById(a.patient);
  const matches = matchingAllergies(data.drug, p?.allergies ?? []);
  if (matches.length && !acknowledgeAllergy) throw err(409, `${data.drug} matches a recorded allergy: ${matches.join(', ')}. Confirm to prescribe anyway.`, 'ALLERGY_WARNING', { allergens: matches });
  const rx = await repo.addPrescription({ ...data, hospital: a.hospital, admission: a._id, patient: a.patient, prescribedBy: actor.id, prescriberName: await repo.userName(actor.id), ...(matches.length && { allergyOverride: { allergens: matches, acknowledgedAt: new Date() } }) });
  await audit(actor, matches.length ? 'prescription.allergy_override' : 'prescription.create', a.patientId, { admission: sid(a._id) });
  return presentRx(rx);
}

// ---- discharge summary (feature 89) ----
const presentSummary = (s) => ({ diagnosis: s.diagnosis, treatment: s.treatment, followUp: s.followUp ?? '', medicines: s.medicines ?? [], finalizedByName: s.finalizedByName, finalizedAt: s.finalizedAt });
/** The finished summary, or a draft filled from the stay (reason and the medicines already prescribed). */
export async function getDischarge(actor, id) {
  const a = await own(actor, id);
  await audit(actor, 'record.view', a.patientId, { view: 'discharge' });
  const done = await repo.findSummary(a._id);
  if (done) return { finalized: true, summary: presentSummary(done) };
  const rx = [...(await repo.listPrescriptions(a._id))].reverse();
  return { finalized: false, summary: { diagnosis: a.reason ?? '', treatment: '', followUp: '', medicines: rx.map((p) => ({ drug: p.drug, dose: p.dose, frequency: p.frequency, duration: p.duration })) } };
}
export async function finalizeDischarge(actor, id, v) {
  const a0 = await own(actor, id, { open: true });
  const a = await repo.closeAdmission(a0.hospital, a0._id); // the one update that decides who discharges
  if (!a) throw err(409, 'This patient has already been discharged', 'ADMISSION_CLOSED');
  let summary;
  try { summary = await repo.createSummary({ ...v, hospital: a.hospital, admission: a._id, patient: a.patient, finalizedBy: actor.id, finalizedByName: await repo.userName(actor.id), finalizedAt: new Date() }); } catch (e) { await repo.reopenAdmission(a._id); throw e; }
  if (a.bed) await repo.moveBed(a.hospital, a.bed, ['occupied'], 'cleaning', { unset: { admission: '' } });
  await repo.appendHospitalization(a.patient, summary._id, { hospital: (await repo.hospitalName(a.hospital)) ?? 'Hospital', admittedOn: a.admittedAt, dischargedOn: a.dischargedAt, reason: summary.diagnosis });
  await audit(actor, 'admission.discharge', a.patientId, { admission: sid(a._id) });
  return { finalized: true, summary: presentSummary(summary) };
}
