// Database access for beds, admissions, visit records, prescriptions and discharge summaries.
// Every "take" or "close" is ONE conditional update, so two people cannot take the same bed or discharge the same stay twice.
import { Admission, AuditLog, Bed, DischargeSummary, Doctor, Hospital, Patient, Prescription, User, VisitRecord } from '../models/index.js';

const lean = (q) => q.lean();

export const findPatientByPatientId = (patientId) => lean(Patient.findOne({ patientId }).select('patientId fullName bloodGroup allergies'));
export const findPatientById = (id) => lean(Patient.findById(id).select('patientId fullName bloodGroup dateOfBirth allergies'));
export const hospitalName = async (id) => (await lean(Hospital.findById(id).select('name')))?.name;
export const listDoctors = (hospital) => lean(Doctor.find({ hospital }).sort({ name: 1 }));
export const findDoctor = (hospital, id) => lean(Doctor.findOne({ _id: id, hospital }));

export const listBeds = (hospital) => lean(Bed.find({ hospital }).sort({ ward: 1, label: 1 }));
export const findBed = (hospital, id) => lean(Bed.findOne({ _id: id, hospital }));
export const createBed = (data) => Bed.create(data).then((b) => b.toObject());
export const deleteBed = async (hospital, id) => (await Bed.deleteOne({ _id: id, hospital, status: { $ne: 'occupied' } })).deletedCount === 1;
/** Moves a bed from one of `from` to `to`. Returns the bed, or null when it was not in one of those states. */
export const moveBed = (hospital, id, from, to, extra = {}) => lean(Bed.findOneAndUpdate({ _id: id, hospital, status: { $in: from } }, { $set: { status: to, statusChangedAt: new Date(), ...extra.set }, ...(extra.unset ? { $unset: extra.unset } : {}) }, { returnDocument: 'after' }));

export const openAdmissionFor = (patient) => lean(Admission.findOne({ patient, status: 'admitted' }));
export const createAdmission = (data) => Admission.create(data).then((a) => a.toObject());
export const findAdmission = (hospital, id) => lean(Admission.findOne({ _id: id, hospital }));
export const listAdmissions = (hospital, status) => lean(Admission.find({ hospital, status }).sort({ admittedAt: -1 }).limit(200));
export const updateAdmission = (id, set) => lean(Admission.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after' }));
/** The one update that decides who discharges. Returns the closed stay, or null if it was already closed. */
export const closeAdmission = (hospital, id) => lean(Admission.findOneAndUpdate({ _id: id, hospital, status: 'admitted' }, { $set: { status: 'discharged', dischargedAt: new Date() } }, { returnDocument: 'after' }));
export const reopenAdmission = (id) => Admission.updateOne({ _id: id }, { $set: { status: 'admitted' }, $unset: { dischargedAt: '' } });

export const addRecord = (data) => VisitRecord.create(data).then((r) => r.toObject());
export const listRecords = (admission) => lean(VisitRecord.find({ admission }).sort({ createdAt: -1 }).limit(200));
export const countRecords = (admission) => VisitRecord.countDocuments({ admission });

export const addPrescription = (data) => Prescription.create(data).then((r) => r.toObject());
export const listPrescriptions = (admission) => lean(Prescription.find({ admission }).sort({ createdAt: -1 }));

export const findSummary = (admission) => lean(DischargeSummary.findOne({ admission }));
export const createSummary = (data) => DischargeSummary.create(data).then((r) => r.toObject());
/** Adds the stay to the patient's own history once (a repeat does nothing). */
export const appendHospitalization = (patient, summaryId, entry) => Patient.updateOne({ _id: patient, 'hospitalizations.dischargeSummaryId': { $ne: summaryId } }, { $push: { hospitalizations: { ...entry, dischargeSummaryId: summaryId } } });

export const writeAudit = (data) => AuditLog.create(data);
export const userName = async (id) => (await lean(User.findById(id).select('name')))?.name;
