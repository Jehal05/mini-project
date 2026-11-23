// Database layer for Phase 9. Every state change is ONE MongoDB update with the rule in its filter,
// so two requests racing for the same case cannot both succeed (feature 65).
import { EmergencyCase, Patient, VitalReading, Hospital, Doctor, AuditLog, PushSubscription, User } from '../models/index.js';

export const ACTIVE_STATUSES = ['accepted', 'ambulance_assigned', 'en_route', 'arrived'];
const MILESTONE_FIELDS = { firstMedicalContact: 'firstMedicalContactAt', treatmentStarted: 'treatmentStartedAt' };
export { MILESTONE_FIELDS };

export const getCase = (id) => EmergencyCase.findById(id).lean();
export const getPatient = (id) => Patient.findById(id).lean();
export const getHospital = (id) => Hospital.findById(id).lean();
export const getDoctor = (id) => Doctor.findById(id).lean();
// The monitoring engine saves readings as hr/sys/dia/spo2/temp/rr; the case screens read heartRate/systolic/... so map here.
const asCaseVitals = (r) => r && { ...r, heartRate: r.hr, systolic: r.sys, diastolic: r.dia, temperature: r.temp, respiratoryRate: r.rr };
export const latestVitals = async (patientId) => asCaseVitals(await VitalReading.findOne({ patient: patientId }).sort({ recordedAt: -1 }).lean());
export const listDoctors = (hospitalId) => Doctor.find({ hospital: hospitalId }).sort({ name: 1 }).lean();

export const pushTimeline = (caseId, entry) =>
  EmergencyCase.updateOne({ _id: caseId }, { $push: { timeline: entry } });

export const setAlertedAt = (caseId, at) =>
  EmergencyCase.updateOne({ _id: caseId, alertedAt: null }, { $set: { alertedAt: at } });

// Feature 65: succeeds only while the case is pending and this hospital was notified.
export const acceptIfPending = (caseId, hospitalId, now) =>
  EmergencyCase.findOneAndUpdate(
    { _id: caseId, status: 'pending', 'notifiedHospitals.hospital': hospitalId, rejectedHospitals: { $ne: hospitalId } },
    {
      $set: { status: 'accepted', hospital: hospitalId, acceptedAt: now },
      $push: { timeline: { event: 'accepted', hospital: hospitalId, at: now } },
    },
    { new: true },
  ).lean();

// Feature 66
export const rejectIfPending = (caseId, hospitalId, reason, now) =>
  EmergencyCase.findOneAndUpdate(
    { _id: caseId, status: 'pending', 'notifiedHospitals.hospital': hospitalId, rejectedHospitals: { $ne: hospitalId } },
    {
      $addToSet: { rejectedHospitals: hospitalId },
      $push: { timeline: { event: 'rejected', hospital: hospitalId, detail: reason, at: now } },
    },
    { new: true },
  ).lean();

// Feature 68
export const setDoctor = (caseId, hospitalId, doctorId, now) =>
  EmergencyCase.findOneAndUpdate(
    { _id: caseId, hospital: hospitalId, status: { $in: ACTIVE_STATUSES } },
    { $set: { doctor: doctorId }, $push: { timeline: { event: 'doctor_assigned', hospital: hospitalId, detail: String(doctorId), at: now } } },
    { new: true },
  ).lean();

// Feature 69
export const setPreparation = (caseId, hospitalId, item, done, now) =>
  EmergencyCase.findOneAndUpdate(
    { _id: caseId, hospital: hospitalId, status: { $in: ACTIVE_STATUSES } },
    {
      $set: { [`preparation.${item}`]: { done, at: now } },
      $push: { timeline: { event: `${item}_${done ? 'done' : 'undone'}`, hospital: hospitalId, at: now } },
    },
    { new: true },
  ).lean();

// Feature 105: first medical contact and treatment start. Set once only.
export const setMilestone = (caseId, hospitalId, name, now) => {
  const field = MILESTONE_FIELDS[name];
  return EmergencyCase.findOneAndUpdate(
    { _id: caseId, hospital: hospitalId, status: { $in: ACTIVE_STATUSES }, [field]: null },
    { $set: { [field]: now }, $push: { timeline: { event: name, hospital: hospitalId, at: now } } },
    { new: true },
  ).lean();
};

// No-answer handling. Each returns true only for the single caller that actually changed the case.
export async function addTimedOut(caseId, hospitalId, now) {
  const r = await EmergencyCase.updateOne(
    { _id: caseId, status: 'pending', timedOutHospitals: { $ne: hospitalId } },
    { $push: { timedOutHospitals: hospitalId, timeline: { event: 'no_answer', hospital: hospitalId, at: now } } },
  );
  return r.modifiedCount === 1;
}

export async function markAllBusy(caseId, now) {
  const r = await EmergencyCase.updateOne(
    { _id: caseId, status: 'pending', allHospitalsBusy: { $ne: true } },
    { $set: { allHospitalsBusy: true }, $push: { timeline: { event: 'all_hospitals_busy', at: now } } },
  );
  return r.modifiedCount === 1;
}

// Feature 62: pending cases this hospital was notified about (and has not rejected), plus its own active cases.
export const listForHospital = (hospitalId) =>
  EmergencyCase.find({
    $or: [
      { status: 'pending', 'notifiedHospitals.hospital': hospitalId, rejectedHospitals: { $ne: hospitalId } },
      { hospital: hospitalId, status: { $in: ACTIVE_STATUSES } },
    ],
  }).lean();

// Doctor screen: the active cases assigned to one doctor.
export const listForDoctor = (doctorId) =>
  EmergencyCase.find({ doctor: doctorId, status: { $in: ACTIVE_STATUSES } }).lean();

// Dev-only demo login picker: every doctor with their hospital's name.
export async function listAllDoctors() {
  const docs = await Doctor.find({}).sort({ name: 1 }).lean();
  const hospitals = await Hospital.find({ _id: { $in: docs.map((d) => d.hospital) } }, { name: 1 }).lean();
  const names = new Map(hospitals.map((h) => [String(h._id), h.name]));
  return docs.map((d) => ({ ...d, hospitalName: names.get(String(d.hospital)) ?? null }));
}

export const listPendingForSweep = () =>
  EmergencyCase.find({ status: 'pending', allHospitalsBusy: { $ne: true }, 'notifiedHospitals.0': { $exists: true } }).lean();

export const writeAudit = (entry) => AuditLog.create(entry);

export const listSubscriptions = (hospitalId) => PushSubscription.find({ hospital: hospitalId }).lean();
export const saveSubscription = (hospitalId, { endpoint, keys }) =>
  PushSubscription.updateOne({ endpoint }, { $set: { hospital: hospitalId, keys } }, { upsert: true });
export const removeSubscription = (endpoint) => PushSubscription.deleteOne({ endpoint });

// Demo only (see routes/demo.js): a simulated patient with a simulated critical case.
export async function createDemoEmergency({ lat, lng, severity = 'critical' }) {
  const user = await User.findOneAndUpdate(
    { email: 'rahul.demo@healthtwin.local' },
    { $setOnInsert: { name: 'Rahul Sharma (demo)', passwordHash: 'demo-account-no-login', role: 'patient' } },
    { upsert: true, new: true },
  );
  const patient = await Patient.findOneAndUpdate(
    { user: user._id },
    { $setOnInsert: { fullName: 'Rahul Sharma (demo)', phone: '0000000000', address: 'Simulated address, Pune' } },
    { upsert: true, new: true },
  );
  await VitalReading.create({
    patient: patient._id, hr: 128, sys: 88, dia: 56, spo2: 90, temp: 36.8, rr: 24, scenario: 'cardiac_event',
  });
  const doc = await EmergencyCase.create({
    patient: patient._id,
    severity,
    riskScore: 87,
    location: { type: 'Point', coordinates: [lng, lat] },
    timeline: [{ event: 'detected', at: new Date() }],
  });
  return { caseId: String(doc._id), patientId: String(patient._id) };
}
