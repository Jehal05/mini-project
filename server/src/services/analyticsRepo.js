// Database reads for analytics (feature 96). Only non-identifying fields are selected:
// no patient reference, no location, no vitals. This is the privacy boundary for the dashboard.
import { EmergencyCase, Trip, Hospital, Ambulance } from '../models/index.js';

const CASE_FIELDS =
  'severity status detectedAt alertedAt acceptedAt hospital notifiedHospitals allHospitalsBusy preparation ' +
  'ambulanceAtPatientAt patientOnBoardAt firstMedicalContactAt treatmentStartedAt closedAt timeline';

export function listCases({ from, to, hospitalId }) {
  const filter = { detectedAt: { $gte: from, $lte: to } };
  if (hospitalId) filter.$or = [{ hospital: hospitalId }, { 'notifiedHospitals.hospital': hospitalId }];
  return EmergencyCase.find(filter).select(CASE_FIELDS).lean();
}
export const listTrips = (caseIds) => Trip.find({ emergencyCase: { $in: caseIds } }).select('emergencyCase ambulance stageTimes endedAt').lean();
export const listHospitals = () => Hospital.find().select('name').lean();
export const listAmbulances = (hospitalId) => Ambulance.find(hospitalId ? { homeHospital: hospitalId } : {}).select('vehicleNumber type').lean();
