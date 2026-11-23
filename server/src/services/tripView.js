// Pure: turns a trip document into the payload the screens use (features 76, 77, 78).
import { remainingM, etaMinutes } from './routeMath.js';
import { STAGE_LABELS } from './tripStages.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export function etaFor(trip, speedKmh) {
  const leg = trip.legs?.[trip.legIndex];
  if (!leg) return { remainingKm: 0, etaMinutes: 0, etaHospitalMinutes: 0 };
  const rem = remainingM(leg.lengthM, trip.metersAlong || 0);
  const toHospital = trip.legIndex === 0 ? rem + (trip.legs?.[1]?.lengthM ?? 0) : rem;
  return {
    remainingKm: Math.round((rem / 1000) * 100) / 100,
    etaMinutes: etaMinutes(rem, speedKmh),
    etaHospitalMinutes: etaMinutes(toHospital, speedKmh),
  };
}

export function serializeTrip(trip, { ambulance, hospital, patientLocation, speedKmh, includeCrew = true } = {}) {
  const speed = trip.speedKmh || speedKmh;
  const times = trip.stageTimes || {};
  return {
    caseId: String(trip.emergencyCase),
    stage: trip.stage,
    stageLabel: STAGE_LABELS[trip.stage],
    stageTimes: Object.fromEntries(Object.keys(STAGE_LABELS).map((k) => [k, iso(times[k])])),
    activeLeg: trip.legIndex,
    legs: (trip.legs || []).map((l) => ({
      name: l.name,
      coordinates: l.coordinates,
      distanceKm: l.distanceKm,
      etaSource: l.etaSource,
    })),
    position: trip.position || null,
    atDestination: trip.legs?.[trip.legIndex] ? (trip.metersAlong || 0) >= trip.legs[trip.legIndex].lengthM : false,
    ...etaFor(trip, speed),
    ambulance: ambulance
      ? {
          id: String(ambulance._id),
          vehicleNumber: ambulance.vehicleNumber,
          type: ambulance.type,
          ...(includeCrew ? { crew: ambulance.crew || [] } : {}),
        }
      : null,
    hospital: hospital
      ? {
          id: String(hospital._id),
          name: hospital.name,
          location: hospital.location?.coordinates ? { lat: hospital.location.coordinates[1], lng: hospital.location.coordinates[0] } : null,
        }
      : null,
    patientLocation: patientLocation || null,
    ended: Boolean(trip.endedAt),
    notice: 'Simulated data for demonstration. Not a medical device.',
  };
}
