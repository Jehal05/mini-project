// Database access for the hospital's own management screens: profile, dashboard, doctors, emergency department bays, history.
// Every change is ONE conditional update with its rule in the filter, so two clicks cannot both succeed.
import mongoose from 'mongoose';
import { Admission, Ambulance, AuditLog, Bed, Doctor, EdBay, EmergencyCase, Hospital, Patient } from '../models/index.js';

const lean = (q) => q.lean();

export const getHospital = (id) => lean(Hospital.findById(id));
export const updateHospital = (id, set) => lean(Hospital.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after', runValidators: true }));
export const setCardiologistFlag = (id, on) => Hospital.updateOne({ _id: id }, { $set: { 'capabilities.cardiologistOnDuty': on } });

// ---- doctors (83) ----
export const listDoctors = (hospital) => lean(Doctor.find({ hospital }).sort({ isActive: -1, onDuty: -1, name: 1 }));
export const findDoctor = (hospital, id) => lean(Doctor.findOne({ _id: id, hospital }));
export const createDoctor = (data) => Doctor.create(data).then((d) => d.toObject());
export const updateDoctor = (hospital, id, set) => lean(Doctor.findOneAndUpdate({ _id: id, hospital }, { $set: set }, { returnDocument: 'after', runValidators: true }));
export const cardiologistOnDuty = async (hospital) => Boolean(await Doctor.exists({ hospital, isActive: true, onDuty: true, specialty: 'cardiologist' }));
export const countDoctorsOnDuty = (hospital) => Doctor.countDocuments({ hospital, isActive: true, onDuty: true });

// ---- dashboard (82) ----
// aggregate() does not cast ids the way find() does, so the string id from the token is converted here.
export const bedCounts = (hospital) => Bed.aggregate([{ $match: { hospital: new mongoose.Types.ObjectId(String(hospital)) } }, { $group: { _id: { ward: '$ward', status: '$status' }, n: { $sum: 1 } } }]);
export const countAvailableAmbulances = (hospital) => Ambulance.countDocuments({ homeHospital: hospital, status: 'available', currentCase: null });
export const countActiveAdmissions = (hospital) => Admission.countDocuments({ hospital, status: 'admitted' });
// Cases this hospital is being asked about right now, and the ones it is already handling.
export const countIncoming = (hospital) => EmergencyCase.countDocuments({ status: 'pending', 'notifiedHospitals.hospital': hospital, rejectedHospitals: { $ne: hospital } });
export const countHandling = (hospital) => EmergencyCase.countDocuments({ hospital, status: { $in: ['accepted', 'ambulance_assigned', 'en_route', 'arrived'] } });
export const recentAccepted = (hospital, limit = 100) =>
  lean(EmergencyCase.find({ hospital, acceptedAt: { $exists: true } }).sort({ acceptedAt: -1 }).limit(limit).select('acceptedAt notifiedHospitals'));

// ---- emergency department (86) ----
export const listBays = (hospital) => lean(EdBay.find({ hospital }).sort({ label: 1 }));
export const countBays = (hospital) => EdBay.countDocuments({ hospital });
export const createBay = (data) => EdBay.create(data).then((b) => b.toObject());
export const findBay = (hospital, id) => lean(EdBay.findOne({ _id: id, hospital }));
export const moveBay = (hospital, id, from, update) => lean(EdBay.findOneAndUpdate({ _id: id, hospital, status: from }, update, { returnDocument: 'after' }));
export const deleteBay = async (hospital, id) => (await EdBay.deleteOne({ _id: id, hospital, status: 'vacant' })).deletedCount === 1;
export const findPatientByPatientId = (patientId) => lean(Patient.findOne({ patientId }).select('patientId fullName'));
export const listArriving = (hospital) =>
  lean(EmergencyCase.find({ hospital, status: { $in: ['accepted', 'ambulance_assigned', 'en_route'] } }).sort({ acceptedAt: 1 }).select('patient severity status acceptedAt ambulance'));
export const patientsByIds = (ids) => lean(Patient.find({ _id: { $in: ids } }).select('patientId fullName'));

// ---- history (90) ----
export const listCases = (filter, { skip, limit }) => lean(EmergencyCase.find(filter).sort({ detectedAt: -1, _id: -1 }).skip(skip).limit(limit));
export const countCases = (filter) => EmergencyCase.countDocuments(filter);

export const writeAudit = (data) => AuditLog.create(data);
