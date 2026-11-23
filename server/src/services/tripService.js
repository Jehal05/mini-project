// Dispatch, pickup, arrival and trip views (features 74, 76, 78, 79, 80).
import { env } from '../config/env.js';
import { EVENTS } from '../sockets/events.js';
import { emitToHospital, emitToCase, emitToPatient } from '../sockets/index.js';
import * as ambulanceRepo from './ambulanceRepo.js';
import * as tripRepo from './tripRepo.js';
import * as caseRepo from './caseRepo.js';
import { getRouteGeometry } from './routeGeometry.js';
import { pathLengthM } from './routeMath.js';
import { serializeTrip } from './tripView.js';
import { assertTransition, STAGE_LABELS } from './tripStages.js';
import { broadcastCase } from './caseService.js';
import { safeEmit } from './notifications.js';
import { httpError } from '../utils/httpError.js';
import { isObjectId } from '../utils/ids.js';

const sid = String;
const MESSAGES = {
  en_route: 'An ambulance is on the way.',
  at_patient: 'The ambulance has arrived.',
  patient_on_board: 'The patient is on board.',
  en_route_to_hospital: 'The ambulance is heading to the hospital.',
  at_hospital: 'The ambulance has arrived at the hospital.',
};
const point = (coords) => ({ lat: coords[1], lng: coords[0] });

// Tells the case room, the patient and the accepting hospital that the trip changed stage.
export function emitTripStatus(trip, extra = {}) {
  const payload = {
    caseId: sid(trip.emergencyCase),
    ambulanceId: sid(trip.ambulance),
    stage: trip.stage,
    stageLabel: STAGE_LABELS[trip.stage],
    stageTimes: trip.stageTimes || {},
    message: MESSAGES[trip.stage],
    ...extra,
  };
  safeEmit(emitToCase, trip.emergencyCase, EVENTS.AMBULANCE_STATUS, payload);
  safeEmit(emitToPatient, trip.patient, EVENTS.AMBULANCE_STATUS, payload);
  safeEmit(emitToHospital, trip.hospital, EVENTS.AMBULANCE_STATUS, payload);
}

export async function buildTripView(trip, { includeCrew = true } = {}) {
  const [ambulance, hospital, c] = await Promise.all([
    ambulanceRepo.getAmbulance(trip.ambulance),
    caseRepo.getHospital(trip.hospital),
    caseRepo.getCase(trip.emergencyCase),
  ]);
  return serializeTrip(trip, {
    ambulance,
    hospital,
    patientLocation: c?.location?.coordinates ? { lat: c.location.coordinates[1], lng: c.location.coordinates[0] } : null,
    speedKmh: env.ambulanceSpeedKmh,
    includeCrew,
  });
}

// Feature 74: start the trip for the reserved ambulance.
export async function dispatch(caseId, hospitalId) {
  if (!isObjectId(caseId)) throw httpError(400, 'Invalid case id');
  const c = await caseRepo.getCase(caseId);
  if (!c) throw httpError(404, 'Emergency case not found');
  if (sid(c.hospital) !== sid(hospitalId)) throw httpError(403, 'Only the accepting hospital can dispatch');
  if (c.status !== 'accepted') throw httpError(409, c.status === 'pending' ? 'Accept the case first' : 'An ambulance was already dispatched');
  if (!c.ambulance) throw httpError(409, 'No ambulance is assigned yet');

  const [ambulance, hospital] = await Promise.all([ambulanceRepo.getAmbulance(c.ambulance), caseRepo.getHospital(hospitalId)]);
  if (!ambulance || sid(ambulance.currentCase) !== sid(caseId) || ambulance.status !== 'available') {
    throw httpError(409, 'The assigned ambulance is no longer available. Choose another one.');
  }

  // Routes first (network), so the database changes below happen close together.
  const from = point(ambulance.location.coordinates);
  const patient = { lat: c.location.coordinates[1], lng: c.location.coordinates[0] };
  const to = point(hospital.location.coordinates);
  const [toPatient, toHospital] = await Promise.all([getRouteGeometry(from, patient), getRouteGeometry(patient, to)]);
  const legs = [
    { name: 'to_patient', ...toPatient, lengthM: pathLengthM(toPatient.coordinates) },
    { name: 'to_hospital', ...toHospital, lengthM: pathLengthM(toHospital.coordinates) },
  ];

  const now = new Date();
  if (!(await ambulanceRepo.markDispatched(c.ambulance, caseId))) throw httpError(409, 'The ambulance was taken by another case');
  if (!(await tripRepo.dispatchCase(caseId, hospitalId, c.ambulance, now))) {
    await ambulanceRepo.revertDispatched(c.ambulance, caseId);
    throw httpError(409, 'The case changed while dispatching');
  }

  let trip;
  try {
    trip = await tripRepo.createTrip({
      emergencyCase: caseId,
      patient: c.patient,
      ambulance: c.ambulance,
      hospital: hospitalId,
      stage: 'en_route',
      stageTimes: { en_route: now },
      legs,
      legIndex: 0,
      metersAlong: 0,
      position: from,
      speedKmh: env.ambulanceSpeedKmh,
      lastTickAt: now,
    });
  } catch (err) {
    if (err.code === 11000) throw httpError(409, 'A trip already exists for this case');
    throw err;
  }

  emitTripStatus(trip, { message: 'An ambulance is on the way.' });
  await broadcastCase(caseId, hospitalId);
  return buildTripView(trip);
}

async function loadTrip(caseId) {
  if (!isObjectId(caseId)) throw httpError(400, 'Invalid case id');
  const trip = await tripRepo.getTripByCase(caseId);
  if (!trip) throw httpError(404, 'No trip for this case yet');
  return trip;
}

// Feature 79: the crew confirms pickup. The simulator then switches to the hospital leg on its next tick.
export async function confirmPickup(caseId, crewAmbulanceId) {
  const trip = await loadTrip(caseId);
  if (sid(trip.ambulance) !== sid(crewAmbulanceId)) throw httpError(403, 'This trip belongs to another ambulance');
  assertTransition(trip.stage, 'patient_on_board'); // clear 409 message for a wrong stage

  const now = new Date();
  const hospitalLeg = trip.legs[1];
  const updated = await tripRepo.transitionTrip(caseId, 'at_patient', 'patient_on_board', now, {
    legIndex: 1,
    metersAlong: 0,
    position: point(hospitalLeg.coordinates[0]),
  });
  if (!updated) throw httpError(409, 'The trip stage changed. Refresh and try again.');

  await tripRepo.setCaseFields(caseId, { patientOnBoardAt: now }, { event: 'patient_on_board', hospital: trip.hospital, at: now });
  await ambulanceRepo.markOnTrip(trip.ambulance, caseId);
  emitTripStatus(updated);
  await broadcastCase(caseId, trip.hospital);
  return buildTripView(updated);
}

// Feature 80: the crew or ED staff confirm arrival. Opens an admission and frees the ambulance.
export async function confirmArrival(caseId, actor) {
  const trip = await loadTrip(caseId);
  const byCrew = actor.ambulanceId && sid(trip.ambulance) === sid(actor.ambulanceId);
  const byEd = actor.hospitalId && sid(trip.hospital) === sid(actor.hospitalId);
  if (!byCrew && !byEd) throw httpError(403, 'Only this ambulance crew or the receiving hospital can confirm arrival');
  assertTransition(trip.stage, 'at_hospital');

  const now = new Date();
  const end = trip.legs[1].coordinates[trip.legs[1].coordinates.length - 1];
  const updated = await tripRepo.transitionTrip(caseId, 'en_route_to_hospital', 'at_hospital', now, {
    endedAt: now,
    position: point(end),
    metersAlong: trip.legs[1].lengthM,
  });
  if (!updated) throw httpError(409, 'The trip stage changed. Refresh and try again.');

  await tripRepo.setCaseFields(caseId, { status: 'arrived' }, { event: 'arrived_at_hospital', hospital: trip.hospital, at: now });
  await tripRepo.createAdmission({ emergencyCase: caseId, patient: trip.patient, hospital: trip.hospital, admittedAt: now });

  const ambulance = await ambulanceRepo.getAmbulance(trip.ambulance);
  const home = ambulance ? await caseRepo.getHospital(ambulance.homeHospital) : null;
  if (home) await ambulanceRepo.freeAmbulance(trip.ambulance, caseId, home.location.coordinates);

  emitTripStatus(updated);
  const arrived = { caseId: sid(caseId), hospitalId: sid(trip.hospital), message: 'The ambulance has arrived at the hospital.', at: now.toISOString() };
  safeEmit(emitToHospital, trip.hospital, EVENTS.EMERGENCY_ARRIVED, arrived);
  safeEmit(emitToCase, caseId, EVENTS.EMERGENCY_ARRIVED, arrived);
  safeEmit(emitToPatient, trip.patient, EVENTS.EMERGENCY_ARRIVED, arrived);
  await broadcastCase(caseId, trip.hospital);
  return buildTripView(updated);
}

// Hospital staff view of a case trip (null when no trip yet).
export async function getTripForStaff(caseId, hospitalId) {
  if (!isObjectId(caseId)) throw httpError(400, 'Invalid case id');
  const c = await caseRepo.getCase(caseId);
  if (!c) throw httpError(404, 'Emergency case not found');
  if (sid(c.hospital) !== sid(hospitalId)) throw httpError(403, 'Only the accepting hospital can see this trip');
  const trip = await tripRepo.getTripByCase(caseId);
  return { trip: trip ? await buildTripView(trip) : null };
}

// Patient and family view. OWNER: Jehal, protect with the patient login when auth exists.
export async function getTripPublic(caseId) {
  const trip = await loadTrip(caseId);
  return { trip: await buildTripView(trip, { includeCrew: false }) };
}

// Crew view: the ambulance's current trip.
export async function getTripForCrew(ambulanceId) {
  const trip = await tripRepo.getActiveTripForAmbulance(ambulanceId);
  return { trip: trip ? await buildTripView(trip) : null };
}
