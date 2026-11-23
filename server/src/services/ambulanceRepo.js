// Database layer for the fleet (features 71-74). Every state change is ONE update with its rule in the filter.
import { Ambulance } from '../models/index.js';

export const createAmbulance = async (doc) => (await Ambulance.create(doc)).toObject();
export const getAmbulance = (id) => Ambulance.findById(id).lean();

export function listAmbulances({ hospitalId, type, status } = {}) {
  const filter = {};
  if (hospitalId) filter.homeHospital = hospitalId;
  if (type) filter.type = type;
  if (status) filter.status = status;
  return Ambulance.find(filter).sort({ vehicleNumber: 1 }).lean();
}

export const listFreeAmbulances = (hospitalId) =>
  Ambulance.find({ homeHospital: hospitalId, status: 'available', currentCase: null }).lean();

// Dev login list for the crew view.
export const listForCrewLogin = () => Ambulance.find().populate('homeHospital', 'name').sort({ vehicleNumber: 1 }).lean();

// Feature 72: only an unreserved ambulance can go to or from maintenance.
export const setAmbulanceStatus = (id, hospitalId, fromStatuses, to) =>
  Ambulance.findOneAndUpdate(
    { _id: id, homeHospital: hospitalId, status: { $in: fromStatuses }, currentCase: null },
    { $set: { status: to } },
    { new: true },
  ).lean();

// Feature 73: reserve for a case. Succeeds for one caller only.
export const claimAmbulance = (id, caseId, hospitalId) =>
  Ambulance.findOneAndUpdate(
    { _id: id, homeHospital: hospitalId, status: 'available', currentCase: null },
    { $set: { currentCase: caseId } },
    { new: true },
  ).lean();

export const releaseAmbulance = (id, caseId) =>
  Ambulance.findOneAndUpdate({ _id: id, currentCase: caseId, status: 'available' }, { $set: { currentCase: null } }, { new: true }).lean();

// Feature 74
export const markDispatched = (id, caseId) =>
  Ambulance.findOneAndUpdate({ _id: id, currentCase: caseId, status: 'available' }, { $set: { status: 'dispatched' } }, { new: true }).lean();

export const revertDispatched = (id, caseId) =>
  Ambulance.findOneAndUpdate({ _id: id, currentCase: caseId, status: 'dispatched' }, { $set: { status: 'available' } }, { new: true }).lean();

export const markOnTrip = (id, caseId) =>
  Ambulance.findOneAndUpdate({ _id: id, currentCase: caseId, status: 'dispatched' }, { $set: { status: 'on_trip' } }, { new: true }).lean();

// Feature 80: back to available at its home hospital.
export const freeAmbulance = (id, caseId, coordinates) =>
  Ambulance.findOneAndUpdate(
    { _id: id, currentCase: caseId },
    { $set: { status: 'available', currentCase: null, location: { type: 'Point', coordinates } } },
    { new: true },
  ).lean();

export const updateAmbulanceLocation = (id, coordinates) =>
  Ambulance.updateOne({ _id: id }, { $set: { location: { type: 'Point', coordinates } } });
