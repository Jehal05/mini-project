// Ambulance movement simulator (features 75, 77). One timer moves every active trip along its route,
// emits ambulance:position with a live ETA, and promotes stages when the ambulance physically arrives.
import { env } from '../config/env.js';
import { EVENTS } from '../sockets/events.js';
import { emitToHospital, emitToCase, emitToPatient } from '../sockets/index.js';
import * as tripRepo from './tripRepo.js';
import * as ambulanceRepo from './ambulanceRepo.js';
import { positionAlong, advanceAlong, kmhToMps } from './routeMath.js';
import { etaFor } from './tripView.js';
import { emitTripStatus } from './tripService.js';
import { broadcastCase } from './caseService.js';
import { safeEmit } from './notifications.js';

function emitPosition(trip, pos, now) {
  const eta = etaFor(trip, trip.speedKmh || env.ambulanceSpeedKmh);
  const payload = {
    caseId: String(trip.emergencyCase),
    ambulanceId: String(trip.ambulance),
    stage: trip.stage,
    leg: trip.legs[trip.legIndex].name,
    position: pos,
    atDestination: trip.metersAlong >= trip.legs[trip.legIndex].lengthM,
    ...eta,
    at: new Date(now).toISOString(),
  };
  safeEmit(emitToCase, trip.emergencyCase, EVENTS.AMBULANCE_POSITION, payload);
  safeEmit(emitToPatient, trip.patient, EVENTS.AMBULANCE_POSITION, payload);
  safeEmit(emitToHospital, trip.hospital, EVENTS.AMBULANCE_POSITION, payload);
}

// Pickup was confirmed: leave the scene and start the hospital leg (stage en_route_to_hospital).
async function departScene(trip, now) {
  const updated = await tripRepo.transitionTrip(trip.emergencyCase, 'patient_on_board', 'en_route_to_hospital', new Date(now));
  if (!updated) return;
  await tripRepo.setCaseFields(trip.emergencyCase, { status: 'en_route' }, { event: 'departed_scene', hospital: trip.hospital, at: new Date(now) });
  emitTripStatus(updated);
  await broadcastCase(trip.emergencyCase, trip.hospital);
}

// The ambulance reached the patient: stage at_patient. This starts the 10 minute scene-time clock.
async function arriveAtPatient(trip, now) {
  const updated = await tripRepo.transitionTrip(trip.emergencyCase, 'en_route', 'at_patient', new Date(now));
  if (!updated) return;
  await tripRepo.setCaseFields(
    trip.emergencyCase,
    { ambulanceAtPatientAt: new Date(now) },
    { event: 'ambulance_at_patient', hospital: trip.hospital, at: new Date(now) },
  );
  emitTripStatus(updated);
  await broadcastCase(trip.emergencyCase, trip.hospital);
}

async function tickTrip(trip, now) {
  if (trip.stage === 'patient_on_board') {
    await departScene(trip, now);
    return 'departed';
  }

  const leg = trip.legs[trip.legIndex];
  const speedKmh = trip.speedKmh || env.ambulanceSpeedKmh;
  // Use real elapsed time, capped, so a pause or restart does not make the ambulance jump.
  const dtSec = Math.min(Math.max((now - new Date(trip.lastTickAt).getTime()) / 1000, 0), env.ambulanceTickSeconds * 3);

  const { alongM, done } = advanceAlong({ alongM: trip.metersAlong || 0, totalM: leg.lengthM, speedKmh, dtSec });
  const position = positionAlong(leg.coordinates, alongM);

  // Applies only if nobody else ticked this trip first, so a tick is never applied twice.
  const updated = await tripRepo.advanceTrip(trip._id, { lastTickAt: trip.lastTickAt, stage: trip.stage }, {
    metersAlong: alongM,
    position,
    lastTickAt: new Date(now),
  });
  if (!updated) return 'skipped';

  await ambulanceRepo.updateAmbulanceLocation(trip.ambulance, [position.lng, position.lat]);
  emitPosition(updated, position, now);
  if (done && trip.stage === 'en_route') await arriveAtPatient(updated, now);
  return 'moved';
}

// One pass over every moving trip. `now` can be passed in for tests.
export async function runSimulatorTick({ now = Date.now() } = {}) {
  const trips = await tripRepo.listMovingTrips();
  const result = { trips: trips.length, moved: 0, skipped: 0, departed: 0 };
  for (const trip of trips) {
    try {
      const r = await tickTrip(trip, now);
      if (r === 'moved') result.moved += 1;
      else if (r === 'skipped') result.skipped += 1;
      else if (r === 'departed') result.departed += 1;
    } catch (err) {
      console.error('[simulator] trip', String(trip._id), 'failed:', err.message);
    }
  }
  return result;
}

export function startAmbulanceSimulator({ tickSeconds = env.ambulanceTickSeconds } = {}) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never let two ticks overlap
    running = true;
    try {
      await runSimulatorTick();
    } finally {
      running = false;
    }
  }, tickSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

export { kmhToMps };
