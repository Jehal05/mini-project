import { Admission } from '../models/Admission.js';
import { Bed } from '../models/Bed.js';
import { Doctor } from '../models/Doctor.js';
import { DischargeSummary } from '../models/DischargeSummary.js';
import { Hospital } from '../models/Hospital.js';
import { HospitalCase } from '../models/HospitalCase.js';
import { Patient } from '../models/Patient.js';
import { Prescription } from '../models/Prescription.js';
import { VisitRecord } from '../models/VisitRecord.js';
import { ApiError } from '../utils/ApiError.js';
import { actorName } from '../utils/actorName.js';
import { writeAudit } from '../utils/audit.js';
import { deleteFile, readFile, saveFile } from '../utils/storage.js';
import { releaseSlots, reserveSlots } from '../utils/slots.js';
import { visitFileSchema } from '../utils/hospitalSchemas.js';
import { announceBeds } from '../services/beds.js';
import { matchingAllergies } from '../services/allergyCheck.js';
import { buildHealthSummary } from '../services/healthSummary.js';
import { getFullRecord, presentPatient } from '../services/patientSummary.js';
import { checkedUpload, setFileHeaders } from './profile.controller.js';

const fieldError = (field, message) => new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', { [field]: message });
const MAX_RECORDS_PER_ADMISSION = 200;

/** Loads an admission of the caller's own hospital. Another hospital's admission looks exactly like a missing one. */
async function ownAdmission(req, { open = false } = {}) {
  const admission = await Admission.findOne({ _id: req.params.id, hospital: req.hospitalId });
  if (!admission) throw ApiError.notFound('Admission not found');
  if (open && admission.status !== 'admitted') throw ApiError.conflict('This patient has been discharged', 'ADMISSION_CLOSED');
  return admission;
}

/** Health data about the patient is only returned after the view is in the audit log (feature 98). */
const auditedView = (req, admission, view) =>
  writeAudit({ req, action: 'record.view', resourceType: 'patient', resourceId: admission.patientId, meta: { via: 'admission', view }, strict: true });

const releaseBed = (bedId) => Bed.updateOne({ _id: bedId, status: 'occupied' }, { $set: { status: 'vacant', statusChangedAt: new Date() }, $unset: { admission: '' } });

// ---- feature 84: admission -----------------------------------------------------------------------------

export async function admit(req, res) {
  const { patientId, bedId, doctorId, reason, caseId } = req.valid;
  const hospital = req.hospitalId;

  const patient = await Patient.findOne({ patientId }).select('patientId');
  if (!patient) throw fieldError('patientId', 'No patient with that ID');
  const doctor = await Doctor.findOne({ _id: doctorId, hospital, isActive: true });
  if (!doctor) throw fieldError('doctorId', 'Choose a doctor from this hospital');
  let hospitalCase = null;
  if (caseId) {
    hospitalCase = await HospitalCase.findOne({ _id: caseId, hospital, status: { $in: ['received', 'accepted', 'arrived'] } });
    if (!hospitalCase) throw fieldError('caseId', 'That emergency case is not open at this hospital');
    if (hospitalCase.patientId && hospitalCase.patientId !== patient.patientId) throw fieldError('caseId', 'That case belongs to a different patient');
  }

  // 1. take the bed (one conditional update: only one request can win it)
  const bed = await Bed.findOneAndUpdate({ _id: bedId, hospital, status: { $in: ['vacant', 'reserved'] } }, { $set: { status: 'occupied', statusChangedAt: new Date() } }, { returnDocument: 'after' });
  if (!bed) {
    if (!(await Bed.exists({ _id: bedId, hospital }))) throw fieldError('bedId', 'Choose a bed from this hospital');
    throw ApiError.conflict('That bed is not available', 'BED_UNAVAILABLE');
  }
  // 2. admit (a partial unique index allows one open admission per patient, so a second admission fails here)
  let admission;
  try {
    admission = await Admission.create({
      hospital, patient: patient._id, patientId: patient.patientId, bed: bed._id, ward: bed.type, doctor: doctor._id, reason,
      admittedBy: req.user.id, ...(hospitalCase && { hospitalCase: hospitalCase._id, emergencyCaseId: hospitalCase.emergencyCaseId }),
    });
  } catch (err) {
    await releaseBed(bed._id);
    if (err?.code === 11000) throw ApiError.conflict('This patient is already admitted', 'ALREADY_ADMITTED');
    throw err;
  }
  await Bed.updateOne({ _id: bed._id }, { $set: { admission: admission._id } });
  if (hospitalCase) await HospitalCase.updateOne({ _id: hospitalCase._id }, { $set: { status: 'admitted' } });
  await writeAudit({ req, action: 'admission.create', resourceType: 'patient', resourceId: patient.patientId, meta: { admission: String(admission._id), ward: bed.type, bed: bed.label } });
  await announceBeds(hospital);
  res.status(201).json({ admission: admission.toJSON() });
}

export async function listAdmissions(req, res) {
  const status = req.query.status === 'discharged' ? 'discharged' : 'admitted';
  const rows = await Admission.find({ hospital: req.hospitalId, status }).sort({ admittedAt: -1 }).limit(200)
    .populate('patient', 'fullName bloodGroup').populate('bed', 'label type').populate('doctor', 'fullName');
  res.json({
    admissions: rows.map((a) => ({
      ...a.toJSON(), patient: undefined, bed: undefined, doctor: undefined,
      patientName: a.patient?.fullName, bloodGroup: a.patient?.bloodGroup, bedLabel: a.bed?.label, doctorName: a.doctor?.fullName,
    })),
  });
}

export async function getAdmission(req, res) {
  const a = await ownAdmission(req);
  const [bed, doctor, summary, prescriptionCount, recordCount] = await Promise.all([
    Bed.findById(a.bed).select('label type'), Doctor.findById(a.doctor).select('fullName specialization'),
    DischargeSummary.exists({ admission: a._id }), Prescription.countDocuments({ admission: a._id }), VisitRecord.countDocuments({ admission: a._id }),
  ]);
  const patient = await Patient.findById(a.patient).select('fullName bloodGroup');
  res.json({ admission: { ...a.toJSON(), patientName: patient?.fullName, bloodGroup: patient?.bloodGroup, bedLabel: bed?.label, doctorName: doctor?.fullName, hasDischargeSummary: Boolean(summary), prescriptionCount, recordCount } });
}

/** The patient's full record, for the hospital treating them. Only while admitted; every view is logged first. */
export async function patientRecord(req, res) {
  const a = await ownAdmission(req, { open: true });
  await auditedView(req, a, 'record');
  const patient = await Patient.findById(a.patient);
  res.set('Cache-Control', 'private, no-store');
  res.json({ patient: await getFullRecord(patient, { photoPath: null }), summary: buildHealthSummary(patient, await vitalsFor(a)) });
}

// ---- feature 94: automated health summary --------------------------------------------------------------

async function vitalsFor(admission) {
  const vitals = await VisitRecord.find({ admission: admission._id, kind: 'vitals' }).sort({ createdAt: -1 });
  if (!vitals.length) return {};
  const latest = { ...vitals[0].vitals.toObject(), at: vitals[0].createdAt };
  const earlier = vitals.slice(1);
  const avg = (key) => {
    const v = earlier.map((r) => r.vitals?.[key]).filter(Number.isFinite);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : undefined;
  };
  return { latest, baseline: earlier.length ? { heartRate: avg('heartRate'), spo2: avg('spo2') } : undefined };
}

export async function healthSummary(req, res) {
  const a = await ownAdmission(req, { open: true });
  await auditedView(req, a, 'summary');
  res.json({ summary: buildHealthSummary(await Patient.findById(a.patient), await vitalsFor(a)) });
}

// ---- feature 87: medical record of the visit -----------------------------------------------------------

export async function listRecords(req, res) {
  const a = await ownAdmission(req);
  await auditedView(req, a, 'visit_records');
  const rows = await VisitRecord.find({ admission: a._id }).sort({ createdAt: -1 });
  res.json({ records: rows.map((r) => r.toJSON()) });
}

const slotKey = (a) => `visit:${a._id}`;

export async function addRecord(req, res) {
  const a = await ownAdmission(req, { open: true });
  const release = await reserveSlots(slotKey(a), 1, MAX_RECORDS_PER_ADMISSION, `One admission can have at most ${MAX_RECORDS_PER_ADMISSION} entries`, 'RECORD_LIMIT');
  try {
    const { kind, ...rest } = req.valid;
    const record = await VisitRecord.create({
      hospital: req.hospitalId, admission: a._id, kind, author: req.user.id, authorName: await actorName(req),
      ...(kind === 'note' ? { text: rest.text } : { vitals: rest }),
    });
    await writeAudit({ req, action: 'record.edit', resourceType: 'patient', resourceId: a.patientId, meta: { section: 'visit_records', op: kind } });
    res.status(201).json({ record: record.toJSON() });
  } catch (err) { await release(); throw err; }
}

export async function addRecordFile(req, res) {
  const a = await ownAdmission(req, { open: true });
  const body = visitFileSchema.safeParse(req.body ?? {});
  if (!body.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', Object.fromEntries(body.error.issues.map((i) => [i.path.join('.') || '_', i.message])));
  const { type, data } = checkedUpload(req, ['pdf', 'jpeg', 'png'], 'A report');
  const release = await reserveSlots(slotKey(a), 1, MAX_RECORDS_PER_ADMISSION, `One admission can have at most ${MAX_RECORDS_PER_ADMISSION} entries`, 'RECORD_LIMIT');
  let storedName;
  try {
    storedName = await saveFile('visit', data, type.ext);
    const clean = String(req.file.originalname ?? 'report').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 120) || 'report';
    const record = await VisitRecord.create({
      hospital: req.hospitalId, admission: a._id, kind: body.data.kind, title: body.data.title, storedName, originalName: clean, mimeType: type.mime, size: data.length, author: req.user.id, authorName: await actorName(req),
    });
    await writeAudit({ req, action: 'record.edit', resourceType: 'patient', resourceId: a.patientId, meta: { section: 'visit_records', op: body.data.kind } });
    res.status(201).json({ record: record.toJSON() });
  } catch (err) {
    if (storedName) await deleteFile('visit', storedName).catch(() => {});
    await release();
    throw err;
  }
}

export async function recordFile(req, res) {
  const a = await ownAdmission(req);
  const record = await VisitRecord.findOne({ _id: req.params.recordId, admission: a._id, hospital: req.hospitalId }).select('+storedName');
  if (!record?.storedName) throw ApiError.notFound('File not found');
  await auditedView(req, a, 'visit_file');
  setFileHeaders(res, record.mimeType, record.originalName);
  res.send(await readFile('visit', record.storedName));
}

// ---- feature 88: prescriptions -------------------------------------------------------------------------

export async function listPrescriptions(req, res) {
  const a = await ownAdmission(req);
  await auditedView(req, a, 'prescriptions');
  res.json({ prescriptions: (await Prescription.find({ admission: a._id }).sort({ createdAt: -1 })).map((p) => p.toJSON()) });
}

export async function prescribe(req, res) {
  const a = await ownAdmission(req, { open: true });
  const { acknowledgeAllergy, ...data } = req.valid;
  const patient = await Patient.findById(a.patient).select('allergies');
  const matches = matchingAllergies(data.drug, patient?.allergies ?? []);
  if (matches.length && !acknowledgeAllergy) {
    throw new ApiError(409, 'ALLERGY_WARNING', `${data.drug} matches a recorded allergy: ${matches.join(', ')}. Confirm to prescribe anyway.`, { allergens: matches });
  }
  const p = await Prescription.create({
    ...data, hospital: req.hospitalId, admission: a._id, patient: a.patient, prescribedBy: req.user.id, prescriberName: await actorName(req),
    ...(matches.length && { allergyOverride: { allergens: matches, acknowledgedAt: new Date() } }),
  });
  await writeAudit({ req, action: matches.length ? 'prescription.allergy_override' : 'prescription.create', resourceType: 'patient', resourceId: a.patientId, meta: { admission: String(a._id) } });
  res.status(201).json({ prescription: p.toJSON() });
}

/** Warns before saving (the form calls this as the doctor types the drug name). */
export async function checkAllergy(req, res) {
  const a = await ownAdmission(req, { open: true });
  const drug = String(req.query.drug ?? '').slice(0, 120);
  const patient = await Patient.findById(a.patient).select('allergies');
  res.json({ allergens: drug ? matchingAllergies(drug, patient?.allergies ?? []) : [] });
}

// ---- feature 89: discharge summary ---------------------------------------------------------------------

async function summaryPayload(a) {
  const [hospital, patient, doctor] = await Promise.all([Hospital.findById(a.hospital).select('name address phone'), Patient.findById(a.patient), Doctor.findById(a.doctor).select('fullName')]);
  const base = { admittedAt: a.admittedAt, dischargedAt: a.dischargedAt, ward: a.ward, reason: a.reason, doctorName: doctor?.fullName, hospital: hospital?.toJSON(), patient: { fullName: patient?.fullName, patientId: patient?.patientId, age: presentPatient(patient).age, bloodGroup: patient?.bloodGroup } };
  return base;
}

/** The finalized summary, or a draft pre-filled from the admission (reason and the medicines prescribed). */
export async function getDischarge(req, res) {
  const a = await ownAdmission(req);
  await auditedView(req, a, 'discharge');
  const existing = await DischargeSummary.findOne({ admission: a._id });
  if (existing) return res.json({ summary: existing.toJSON(), finalized: true, context: await summaryPayload(a) });
  const prescriptions = await Prescription.find({ admission: a._id }).sort({ createdAt: 1 });
  return res.json({
    finalized: false, context: await summaryPayload(a),
    summary: { diagnosis: a.reason ?? '', treatment: '', followUp: '', medicines: prescriptions.map((p) => ({ drug: p.drug, dose: p.dose, frequency: p.frequency, duration: p.duration })) },
  });
}

export async function finalizeDischarge(req, res) {
  const a0 = await ownAdmission(req, { open: true });
  // The one conditional update that decides who discharges: a second request sees "already discharged".
  const a = await Admission.findOneAndUpdate({ _id: a0._id, hospital: req.hospitalId, status: 'admitted' }, { $set: { status: 'discharged', dischargedAt: new Date() } }, { returnDocument: 'after' });
  if (!a) throw ApiError.conflict('This patient has already been discharged', 'ADMISSION_CLOSED');
  let summary;
  try {
    summary = await DischargeSummary.create({ ...req.valid, hospital: req.hospitalId, admission: a._id, patient: a.patient, finalizedBy: req.user.id, finalizedByName: await actorName(req) });
  } catch (err) {
    await Admission.updateOne({ _id: a._id }, { $set: { status: 'admitted' }, $unset: { dischargedAt: '' } });
    throw err;
  }
  await Bed.updateOne({ _id: a.bed, admission: a._id }, { $set: { status: 'cleaning', statusChangedAt: new Date() }, $unset: { admission: '' } });
  const hospital = await Hospital.findById(req.hospitalId).select('name');
  // Adds itself to the patient's history (feature 17). The filter makes a repeat harmless.
  await Patient.updateOne(
    { _id: a.patient, 'hospitalizations.dischargeSummaryId': { $ne: summary._id } },
    { $push: { hospitalizations: { hospital: hospital?.name ?? 'Hospital', admittedOn: a.admittedAt, dischargedOn: a.dischargedAt, reason: summary.diagnosis, dischargeSummaryId: summary._id } } },
  );
  if (a.hospitalCase) await HospitalCase.updateOne({ _id: a.hospitalCase }, { $set: { status: 'closed', closedAt: new Date(), outcome: 'Discharged' } });
  await writeAudit({ req, action: 'discharge.finalize', resourceType: 'patient', resourceId: a.patientId, meta: { admission: String(a._id) } });
  await announceBeds(req.hospitalId);
  res.status(201).json({ summary: summary.toJSON(), finalized: true, context: await summaryPayload(a) });
}
