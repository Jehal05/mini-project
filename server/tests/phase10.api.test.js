import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import request from 'supertest';
import { io as connect } from 'socket.io-client';

// Same approach as Phase 9: the database layers are in-memory fakes, everything else runs for real.
vi.mock('../src/services/caseRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/ambulanceRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/tripRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/alternatives.js', async () => {
  const f = await import('./helpers/fakeDb.js');
  return { prepareCandidates: f.prepareCandidates, markNotified: f.markNotified, nextHospital: f.nextHospital };
});
vi.mock('../src/services/push.js', () => ({ pushToHospital: vi.fn(async () => ({ sent: 0 })) }));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { initSocket } from '../src/sockets/index.js';
import { EVENTS, ROOM_EVENTS } from '../src/sockets/events.js';
import { runSimulatorTick } from '../src/services/simulator.js';
import { autoAssign } from '../src/services/assignment.js';
import { db, resetDb, seedCase, seedAmbulance, stored, storedAmbulance, storedTrip, oid } from './helpers/fakeDb.js';

const [H1, H2] = [oid(1), oid(2)];
const staff = (h = H1) => ({ 'x-hospital-id': h });
const crew = (a) => ({ 'x-ambulance-id': a });

let httpServer, ioServer, port;
const clients = [];
async function listen(room, type) {
  const c = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise((r) => c.on('connect', r));
  await new Promise((r) => c.emit(ROOM_EVENTS.JOIN, { type, id: room }, r));
  const got = [];
  for (const e of Object.values(EVENTS)) c.on(e, (payload) => got.push({ event: e, payload }));
  return got;
}
const settle = () => new Promise((r) => setTimeout(r, 120));
const only = (got, event) => got.filter((g) => g.event === event);

const acceptedCase = (over = {}) => seedCase({ status: 'accepted', hospital: H1, acceptedAt: new Date(), ...over });

beforeAll(async () => {
  env.routingProvider = 'none'; // straight-line routes, no network
  env.ambulanceSpeedKmh = 600; // fast, so a whole trip takes a few ticks
  httpServer = http.createServer();
  ioServer = initSocket(httpServer, { corsOrigin: '*' });
  await new Promise((r) => httpServer.listen(0, r));
  port = httpServer.address().port;
});
afterAll(() => {
  clients.forEach((c) => c.close());
  ioServer.close();
});
beforeEach(() => resetDb());

describe('features 71, 72: fleet', () => {
  it('registers an ambulance for the own hospital only and rejects duplicates', async () => {
    const body = { vehicleNumber: 'mh12 ab 1', type: 'ALS', crew: [{ name: 'Asha', role: 'Paramedic' }], equipment: ['AED'] };
    const ok = await request(app).post('/api/ambulances').set(staff()).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ vehicleNumber: 'MH12 AB 1', type: 'ALS', homeHospital: H1, status: 'available' });
    expect((await request(app).post('/api/ambulances').set(staff()).send(body)).status).toBe(409);
    expect((await request(app).post('/api/ambulances').set(staff()).send({ ...body, vehicleNumber: 'X-1234', homeHospital: H2 })).status).toBe(403);
    expect((await request(app).post('/api/ambulances').set(staff()).send({ ...body, type: 'XYZ' })).status).toBe(400);
    expect((await request(app).post('/api/ambulances').send(body)).status).toBe(401);
  });

  it('lists, filters and summarises only the own fleet', async () => {
    seedAmbulance({ type: 'ALS' });
    seedAmbulance({ type: 'BLS', status: 'maintenance' });
    seedAmbulance({ homeHospital: H2 });
    const list = await request(app).get('/api/ambulances?type=ALS').set(staff());
    expect(list.body.count).toBe(1);
    const sum = await request(app).get(`/api/hospitals/${H1}/ambulances/summary`).set(staff());
    expect(sum.body.byStatus).toMatchObject({ available: 1, maintenance: 1 });
    expect((await request(app).get(`/api/hospitals/${H2}/ambulances/summary`).set(staff())).status).toBe(403);
  });

  it('toggles maintenance, but not while reserved', async () => {
    const free = seedAmbulance();
    const reserved = seedAmbulance({ currentCase: oid(999) });
    const to = (id, status) => request(app).patch(`/api/ambulances/${id}/status`).set(staff()).send({ status });
    expect((await to(free, 'maintenance')).body.status).toBe('maintenance');
    expect((await to(free, 'available')).body.status).toBe('available');
    expect((await to(reserved, 'maintenance')).status).toBe(409);
    expect((await to(free, 'on_trip')).status).toBe(400);
  });
});

describe('feature 73: assignment', () => {
  it('reserves the nearest ALS automatically when a hospital accepts', async () => {
    const near = seedAmbulance({ type: 'ALS', location: { type: 'Point', coordinates: [73.89, 18.5] } });
    seedAmbulance({ type: 'ALS', location: { type: 'Point', coordinates: [73.7, 18.4] } });
    const id = seedCase({ notifiedHospitals: [{ hospital: H1, notifiedAt: new Date() }] });
    const res = await request(app).post(`/api/cases/${id}/accept`).set(staff());
    expect(res.status).toBe(200);
    expect(stored(id).ambulance).toBe(near);
    expect(storedAmbulance(near).currentCase).toBe(id);
    expect(stored(id).timeline.map((t) => t.event)).toContain('ambulance_assigned');
  });

  it('uses a BLS when no ALS is free, and records when nothing is free', async () => {
    const bls = seedAmbulance({ type: 'BLS' });
    const a = acceptedCase();
    expect((await autoAssign(a)).ambulanceId).toBe(bls);
    const b = acceptedCase();
    expect(await autoAssign(b)).toMatchObject({ assigned: false, reason: 'none_available' });
    expect(stored(b).timeline.map((t) => t.event)).toContain('no_ambulance_available');
  });

  it('two cases racing for one ambulance: exactly one gets it, the other is told', async () => {
    seedAmbulance();
    const c1 = acceptedCase();
    const c2 = acceptedCase();
    const [r1, r2] = await Promise.all([autoAssign(c1), autoAssign(c2)]);
    expect([r1.assigned, r2.assigned].sort()).toEqual([false, true]);
    expect([...db.ambulances.values()].filter((a) => a.currentCase).length).toBe(1);
  });

  it('staff can override with another ambulance; the old one is released', async () => {
    const first = seedAmbulance();
    const second = seedAmbulance({ type: 'BLS' });
    const id = acceptedCase();
    await autoAssign(id);
    expect(stored(id).ambulance).toBe(first);
    const res = await request(app).post(`/api/cases/${id}/ambulance`).set(staff()).send({ ambulanceId: second });
    expect(res.status).toBe(200);
    expect(stored(id).ambulance).toBe(second);
    expect(storedAmbulance(first).currentCase).toBeNull();
    expect(storedAmbulance(second).currentCase).toBe(id);
    const taken = acceptedCase();
    expect((await request(app).post(`/api/cases/${taken}/ambulance`).set(staff()).send({ ambulanceId: second })).status).toBe(409);
    expect((await request(app).post(`/api/cases/${id}/ambulance`).set(staff(H2)).send({ ambulanceId: second })).status).toBe(403);
  });
});

describe('features 74-80: the full trip', () => {
  async function dispatched() {
    const amb = seedAmbulance();
    const id = acceptedCase();
    await autoAssign(id);
    const res = await request(app).post(`/api/cases/${id}/dispatch`).set(staff());
    expect(res.status).toBe(200);
    return { amb, id, res };
  }

  it('dispatch starts the trip, reserves the ambulance and refuses a second dispatch', async () => {
    const { amb, id, res } = await dispatched();
    expect(res.body).toMatchObject({ stage: 'en_route', activeLeg: 0 });
    expect(res.body.legs).toHaveLength(2);
    expect(res.body.etaMinutes).toBeGreaterThan(0);
    expect(storedAmbulance(amb).status).toBe('dispatched');
    expect(stored(id).status).toBe('ambulance_assigned');
    expect((await request(app).post(`/api/cases/${id}/dispatch`).set(staff())).status).toBe(409);
  });

  it('refuses dispatch without an ambulance, before accepting, or from another hospital', async () => {
    const none = acceptedCase();
    expect((await request(app).post(`/api/cases/${none}/dispatch`).set(staff())).status).toBe(409);
    seedAmbulance();
    const other = acceptedCase();
    await autoAssign(other);
    expect((await request(app).post(`/api/cases/${other}/dispatch`).set(staff(H2))).status).toBe(403);
  });

  it('simulator moves the ambulance, shrinks the ETA and emits to the right rooms only', async () => {
    const { id } = await dispatched();
    const caseRoom = await listen(id, 'case');
    const hospitalRoom = await listen(H1, 'hospital');
    const otherHospital = await listen(H2, 'hospital');
    const patientRoom = await listen(oid(500), 'patient');

    let now = new Date(storedTrip(id).lastTickAt).getTime();
    const etas = [];
    for (let i = 0; i < 2; i += 1) {
      now += 2000;
      await runSimulatorTick({ now });
      etas.push(storedTrip(id).metersAlong);
    }
    await settle();
    expect(etas[1]).toBeGreaterThan(etas[0]);
    const positions = only(caseRoom, EVENTS.AMBULANCE_POSITION).map((g) => g.payload);
    expect(positions).toHaveLength(2);
    expect(positions[1].etaMinutes).toBeLessThan(positions[0].etaMinutes);
    expect(only(hospitalRoom, EVENTS.AMBULANCE_POSITION)).toHaveLength(2);
    expect(only(patientRoom, EVENTS.AMBULANCE_POSITION)).toHaveLength(2);
    expect(only(otherHospital, EVENTS.AMBULANCE_POSITION)).toHaveLength(0);
  });

  it('a stale tick is skipped, so a tick is never applied twice', async () => {
    const { id } = await dispatched();
    const now = new Date(storedTrip(id).lastTickAt).getTime() + 2000;
    const [a, b] = await Promise.all([runSimulatorTick({ now }), runSimulatorTick({ now })]);
    expect(a.moved + b.moved).toBe(1);
    expect(a.skipped + b.skipped).toBe(1);
  });

  it('runs the whole journey: dispatch, arrive at patient, pickup, depart, arrive at hospital', async () => {
    const { amb, id } = await dispatched();
    const crewRoom = await listen(id, 'case');
    const hospitalRoom = await listen(H1, 'hospital');

    // Crew cannot jump ahead before reaching the patient.
    expect((await request(app).post(`/api/trips/${id}/pickup`).set(crew(amb))).status).toBe(409);

    let now = new Date(storedTrip(id).lastTickAt).getTime();
    for (let i = 0; i < 40 && storedTrip(id).stage === 'en_route'; i += 1) {
      now += 2000;
      await runSimulatorTick({ now });
    }
    expect(storedTrip(id).stage).toBe('at_patient');
    expect(stored(id).ambulanceAtPatientAt).toBeTruthy(); // starts the 10 minute scene clock

    // Wrong crew, then right crew.
    expect((await request(app).post(`/api/trips/${id}/pickup`).set(crew(seedAmbulance()))).status).toBe(403);
    const pick = await request(app).post(`/api/trips/${id}/pickup`).set(crew(amb));
    expect(pick.status).toBe(200);
    expect(pick.body.stage).toBe('patient_on_board');
    expect(stored(id).patientOnBoardAt).toBeTruthy();
    expect(storedAmbulance(amb).status).toBe('on_trip');
    expect((await request(app).post(`/api/trips/${id}/pickup`).set(crew(amb))).status).toBe(409); // twice

    // First tick promotes to the hospital leg, later ticks move along it.
    now += 2000;
    await runSimulatorTick({ now });
    expect(storedTrip(id).stage).toBe('en_route_to_hospital');
    expect(stored(id).status).toBe('en_route');
    for (let i = 0; i < 3; i += 1) { now += 2000; await runSimulatorTick({ now }); }
    expect(storedTrip(id).legIndex).toBe(1);
    expect(storedTrip(id).metersAlong).toBeGreaterThan(0);

    // ED confirms arrival: admission opens, ambulance is free again at its home hospital.
    expect((await request(app).post(`/api/trips/${id}/arrive`).set(staff(H2))).status).toBe(403);
    const arr = await request(app).post(`/api/trips/${id}/arrive`).set(staff());
    expect(arr.status).toBe(200);
    expect(arr.body.stage).toBe('at_hospital');
    expect(stored(id).status).toBe('arrived');
    expect(db.admissions).toHaveLength(1);
    expect(storedAmbulance(amb)).toMatchObject({ status: 'available', currentCase: null });
    expect((await request(app).post(`/api/trips/${id}/arrive`).set(staff())).status).toBe(409);
    await settle();
    expect(only(hospitalRoom, EVENTS.EMERGENCY_ARRIVED)).toHaveLength(1);
    const stages = only(crewRoom, EVENTS.AMBULANCE_STATUS).map((g) => g.payload.stage);
    expect(stages).toEqual(['at_patient', 'patient_on_board', 'en_route_to_hospital', 'at_hospital']);

    // The freed ambulance can be reserved by a new case.
    const next = acceptedCase();
    expect((await autoAssign(next)).ambulanceId).toBe(amb);
  });

  it('crew view returns the current trip; patient view hides crew names', async () => {
    const { amb, id } = await dispatched();
    const mine = await request(app).get('/api/trips/crew/current').set(crew(amb));
    expect(mine.body.trip.caseId).toBe(id);
    expect(mine.body.trip.ambulance.crew).toBeDefined();
    const pub = await request(app).get(`/api/trips/${id}/public`);
    expect(pub.status).toBe(200);
    expect(pub.body.trip.ambulance.crew).toBeUndefined();
    expect((await request(app).get('/api/trips/crew/current')).status).toBe(401);
  });
});
