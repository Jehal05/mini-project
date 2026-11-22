import { describe, it, expect } from 'vitest';
import { segmentLengthsM, pathLengthM, positionAlong, advanceAlong, etaMinutes, remainingM, kmhToMps } from '../src/services/routeMath.js';
import { STAGES, canTransition, nextStage, assertTransition } from '../src/services/tripStages.js';
import { rankAmbulances, summarizeFleet } from '../src/services/fleetLogic.js';
import { straightLineRoute, decodePolyline, getRouteGeometry } from '../src/services/routeGeometry.js';
import { etaFor } from '../src/services/tripView.js';

const A = { lat: 18.5, lng: 73.9 };
const B = { lat: 18.52, lng: 73.86 };

describe('routeMath', () => {
  const coords = [[73.9, 18.5], [73.9, 18.51], [73.9, 18.52]];
  it('measures a path and finds a point along it', () => {
    const total = pathLengthM(coords);
    expect(total).toBeGreaterThan(2200);
    expect(total).toBeLessThan(2250);
    expect(positionAlong(coords, 0)).toEqual({ lat: 18.5, lng: 73.9 });
    expect(positionAlong(coords, total * 10).lat).toBeCloseTo(18.52, 5); // clamped to the end
    const mid = positionAlong(coords, segmentLengthsM(coords)[0] / 2);
    expect(mid.lat).toBeCloseTo(18.505, 4);
  });
  it('moves at the given speed and never past the end', () => {
    expect(advanceAlong({ alongM: 0, totalM: 1000, speedKmh: 36, dtSec: 10 })).toEqual({ alongM: 100, done: false });
    expect(advanceAlong({ alongM: 950, totalM: 1000, speedKmh: 36, dtSec: 10 })).toEqual({ alongM: 1000, done: true });
    expect(advanceAlong({ alongM: 0, totalM: 1000, speedKmh: 36, dtSec: -5 }).alongM).toBe(0);
  });
  it('ETA shrinks as the ambulance moves', () => {
    expect(kmhToMps(36)).toBe(10);
    expect(etaMinutes(remainingM(6000, 0), 60)).toBe(6);
    expect(etaMinutes(remainingM(6000, 3000), 60)).toBe(3);
  });
});

describe('tripStages', () => {
  it('only allows the next stage', () => {
    expect(STAGES).toHaveLength(5);
    expect(canTransition('en_route', 'at_patient')).toBe(true);
    expect(canTransition('en_route', 'patient_on_board')).toBe(false);
    expect(canTransition('at_hospital', 'en_route')).toBe(false);
    expect(nextStage('at_hospital')).toBeNull();
  });
  it('gives a clear 409 for a skipped stage', () => {
    try {
      assertTransition('en_route', 'patient_on_board');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.status ?? e.statusCode).toBe(409);
      expect(e.message).toContain('The next stage is at_patient');
    }
  });
});

describe('fleetLogic', () => {
  const amb = (n, type, lng, lat) => ({ _id: n, vehicleNumber: n, type, status: 'available', currentCase: null, location: { coordinates: [lng, lat] } });
  it('prefers ALS even when a BLS is nearer, and picks the nearest within a type', () => {
    const free = [amb('B1', 'BLS', 73.9, 18.501), amb('A_far', 'ALS', 73.8, 18.5), amb('A_near', 'ALS', 73.89, 18.5)];
    expect(rankAmbulances(free, A).map((a) => a._id)).toEqual(['A_near', 'A_far', 'B1']);
  });
  it('falls back to BLS when no ALS is free, and to nothing when the list is empty', () => {
    expect(rankAmbulances([amb('B1', 'BLS', 73.9, 18.5)], A)[0]._id).toBe('B1');
    expect(rankAmbulances([], A)).toEqual([]);
  });
  it('counts reserved ambulances separately from available ones', () => {
    const s = summarizeFleet([amb('A1', 'ALS', 0, 0), { ...amb('A2', 'ALS', 0, 0), currentCase: 'c1' }, { ...amb('B1', 'BLS', 0, 0), status: 'maintenance' }]);
    expect(s.byStatus).toMatchObject({ available: 1, reserved: 1, maintenance: 1 });
    expect(s.byType.ALS).toEqual({ total: 2, available: 1 });
  });
});

describe('routeGeometry', () => {
  it('straight line route has many points and is labelled an estimate', () => {
    const r = straightLineRoute(A, B);
    expect(r.etaSource).toBe('estimate');
    expect(r.coordinates.length).toBeGreaterThan(5);
    expect(r.coordinates[0]).toEqual([A.lng, A.lat]);
    expect(r.coordinates.at(-1)).toEqual([B.lng, B.lat]);
  });
  it('uses OSRM geometry when it answers, and falls back when it fails', async () => {
    const ok = async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 5000, duration: 600, geometry: { coordinates: [[73.9, 18.5], [73.86, 18.52]] } }] }) });
    const r = await getRouteGeometry(A, B, { provider: 'osrm', fetchImpl: ok });
    expect(r.etaSource).toBe('osrm');
    expect(r.distanceKm).toBe(5);
    const bad = async () => { throw new Error('network down'); };
    expect((await getRouteGeometry(A, B, { provider: 'osrm', fetchImpl: bad })).etaSource).toBe('estimate');
    expect((await getRouteGeometry(A, B, { provider: 'mapbox', apiKey: '', fetchImpl: ok })).etaSource).toBe('estimate'); // no key
  });
  it('decodes a Google polyline', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts[0][1]).toBeCloseTo(38.5, 1);
    expect(pts[0][0]).toBeCloseTo(-120.2, 1);
  });
});

describe('etaFor', () => {
  it('adds the hospital leg while still heading to the patient', () => {
    const trip = { legIndex: 0, metersAlong: 0, legs: [{ lengthM: 3000 }, { lengthM: 6000 }] };
    expect(etaFor(trip, 60)).toMatchObject({ etaMinutes: 3, etaHospitalMinutes: 9 });
    expect(etaFor({ ...trip, legIndex: 1 }, 60)).toMatchObject({ etaMinutes: 6, etaHospitalMinutes: 6 });
  });
});
