// Database layer for trips and the case changes that go with them (features 73-80).
import { Trip, EmergencyCase, Admission } from '../models/index.js';

const MOVING = ['en_route', 'patient_on_board', 'en_route_to_hospital'];

export const createTrip = async (doc) => (await Trip.create(doc)).toObject();
// Phase 7: the patient cancelled after a hospital accepted. Stops the trip. Returns the trip once, or null.
export const endTripIfOpen = (caseId, now) =>
  Trip.findOneAndUpdate({ emergencyCase: caseId, endedAt: null, stage: { $ne: 'at_hospital' } }, { $set: { endedAt: now } }, { new: true }).lean();
export const getTripByCase = (caseId) => Trip.findOne({ emergencyCase: caseId }).lean();
export const getActiveTripForAmbulance = (ambulanceId) =>
  Trip.findOne({ ambulance: ambulanceId, stage: { $ne: 'at_hospital' } }).lean();
export const listMovingTrips = () => Trip.find({ stage: { $in: MOVING }, endedAt: null }).lean(); // a cancelled trip has endedAt set and stops moving

// Simulator step. Applies only if nobody else ticked or changed the stage since we read it,
// so two ticks (or a tick and a crew button) can never both apply (feature 75).
export const advanceTrip = (tripId, expected, set) =>
  Trip.findOneAndUpdate(
    { _id: tripId, lastTickAt: expected.lastTickAt, stage: expected.stage },
    { $set: set },
    { new: true },
  ).lean();

// Feature 78: move to the next stage only from the stage we expect, and stamp the time.
export const transitionTrip = (caseId, from, to, now, extra = {}) =>
  Trip.findOneAndUpdate(
    { emergencyCase: caseId, stage: from },
    { $set: { stage: to, [`stageTimes.${to}`]: now, lastTickAt: now, ...extra } },
    { new: true },
  ).lean();

// Feature 73: record the reserved ambulance on the case. Only while the hospital still owns an accepted case.
export const assignAmbulanceToCase = (caseId, hospitalId, ambulanceId) =>
  EmergencyCase.findOneAndUpdate(
    { _id: caseId, hospital: hospitalId, status: 'accepted' },
    { $set: { ambulance: ambulanceId } },
    { new: true },
  ).lean();

// Feature 74
export const dispatchCase = (caseId, hospitalId, ambulanceId, now) =>
  EmergencyCase.findOneAndUpdate(
    { _id: caseId, hospital: hospitalId, status: 'accepted', ambulance: ambulanceId },
    { $set: { status: 'ambulance_assigned' }, $push: { timeline: { event: 'ambulance_dispatched', hospital: hospitalId, at: now } } },
    { new: true },
  ).lean();

// Used for at_patient, pickup, departure and arrival changes on the case.
export const setCaseFields = (caseId, set, timelineEntry) =>
  EmergencyCase.updateOne({ _id: caseId }, { $set: set, ...(timelineEntry ? { $push: { timeline: timelineEntry } } : {}) });

// Feature 80: the stay that starts when the ambulance arrives (no bed yet; staff complete it, see inpatient/). One per case.
// A patient can have only one open stay, so if one already exists the arrival is not blocked by it.
export const createAdmission = async ({ emergencyCase, patient, hospital, admittedAt }) => {
  try {
    return await Admission.findOneAndUpdate(
      { emergencyCase },
      { $setOnInsert: { emergencyCase, patient, hospital, admittedAt } },
      { upsert: true, new: true },
    ).lean();
  } catch (e) {
    if (e?.code === 11000) return null;
    throw e;
  }
};
