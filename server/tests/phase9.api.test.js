import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import request from 'supertest';
import { io as connect } from 'socket.io-client';

// The database layer, the Phase 8 ranking service and web push are replaced by in-memory fakes.
// Routes, auth stub, validation, services, sockets and the sweep all run for real.
vi.mock('../src/services/caseRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/alternatives.js', async () => {
  const f = await import('./helpers/fakeDb.js');
  return { prepareCandidates: f.prepareCandidates, markNotified: f.markNotified, nextHospital: f.nextHospital };
});
vi.mock('../src/services/ambulanceRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/tripRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/push.js', () => ({ pushToHospital: vi.fn(async () => ({ sent: 0 })) }));

import app from '../src/app.js';
import { initSocket } from '../src/sockets/index.js';
import { EVENTS, ROOM_EVENTS } from '../src/sockets/events.js';
import { notifyHospitals, runNoAnswerSweep } from '../src/services/notifications.js';
import { db, resetDb, seedCase, stored, oid } from './helpers/fakeDb.js';

const [H1, H2, H3, H4] = [oid(1), oid(2), oid(3), oid(4)];
const as = (hospitalId) => ({ 'x-hospital-id': hospitalId });

let httpServer;
let ioServer;
let port;
const clients = [];

async function listen(room, type = 'hospital', events = Object.values(EVENTS)) {
  const c = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise((r) => c.on('connect', r));
  const ack = await new Promise((r) => c.emit(ROOM_EVENTS.JOIN, { type, id: room }, r));
  expect(ack.ok).toBe(true);
  const got = [];
  for (const e of events) c.on(e, (payload) => got.push({ event: e, payload }));
  return got;
}
const settle = () => new Promise((r) => setTimeout(r, 120));
const only = (got, event) => got.filter((g) => g.event === event);

beforeAll(async () => {
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

describe('feature 61: automatic notification', () => {
  it('alerts only the top 3 hospital rooms and records everything', async () => {
    const id = seedCase();
    const rooms = { 1: await listen(H1), 2: await listen(H2), 3: await listen(H3), 4: await listen(H4) };

    const result = await notifyHospitals(id);
    await settle();

    expect(result.notified).toEqual([H1, H2, H3]);
    for (const n of [1, 2, 3]) {
      const alerts = only(rooms[n], EVENTS.HOSPITAL_ALERT);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].payload).toMatchObject({ id, severity: 'critical', status: 'pending' });
      expect(alerts[0].payload.respondBy).toBeTruthy();
      expect(alerts[0].payload.latestVitals.heartRate).toBe(128);
    }
    expect(only(rooms[4], EVENTS.HOSPITAL_ALERT)).toHaveLength(0);

    const c = stored(id);
    expect(c.notifiedHospitals).toHaveLength(3);
    expect(c.alertedAt).toBeTruthy();
    expect(c.timeline.map((t) => t.event)).toEqual(['detected', 'hospital_notified', 'hospital_notified', 'hospital_notified']);
  });

  it('marks all hospitals busy when there is nobody to notify', async () => {
    db.ranking = [];
    const id = seedCase();
    const patientRoom = await listen(oid(500), 'patient');
    const result = await notifyHospitals(id);
    await settle();
    expect(result.allHospitalsBusy).toBe(true);
    expect(stored(id).allHospitalsBusy).toBe(true);
    expect(only(patientRoom, EVENTS.EMERGENCY_REJECTED)[0].payload.allHospitalsBusy).toBe(true);
  });
});

describe('auth stub', () => {
  it('requires a hospital identity', async () => {
    const id = seedCase();
    expect((await request(app).get(`/api/cases/${id}`)).status).toBe(401);
    expect((await request(app).get(`/api/hospitals/${H1}/cases`).set('x-hospital-id', 'nope')).status).toBe(401);
  });

  it('stops a hospital reading another hospital queue', async () => {
    const res = await request(app).get(`/api/hospitals/${H2}/cases`).set(as(H1));
    expect(res.status).toBe(403);
  });
});

describe('feature 62 and 64: incoming queue', () => {
  it('lists pending cases ordered by severity then risk, with respondBy, severity and vitals', async () => {
    const high = seedCase({ severity: 'high', riskScore: 99 });
    const critical = seedCase({ severity: 'critical', riskScore: 60 });
    await notifyHospitals(high);
    await notifyHospitals(critical);

    const res = await request(app).get(`/api/hospitals/${H1}/cases`).set(as(H1));
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.id)).toEqual([critical, high]);
    const first = res.body.results[0];
    expect(first.respondBy).toBeTruthy();
    expect(first).toMatchObject({ severity: 'critical', riskScore: 60 });
    expect(first.latestVitals.spo2).toBe(90);
  });

  it('feature 95: explains the order, and supports ?sort=newest and rejects unknown sort modes', async () => {
    const older = seedCase({ severity: 'critical', riskScore: 90, detectedAt: new Date(Date.now() - 600000) });
    const newer = seedCase({ severity: 'critical', riskScore: 20, detectedAt: new Date() });
    await notifyHospitals(older);
    await notifyHospitals(newer);

    const byPriority = await request(app).get(`/api/hospitals/${H1}/cases`).set(as(H1));
    expect(byPriority.body.sort).toBe('priority');
    expect(byPriority.body.results.map((r) => r.id)).toEqual([older, newer]);
    expect(byPriority.body.results[0].priority).toMatchObject({ tier: 4 });
    expect(byPriority.body.results[0].priority.factors).toHaveProperty('wait');

    const byNewest = await request(app).get(`/api/hospitals/${H1}/cases?sort=newest`).set(as(H1));
    expect(byNewest.body.results.map((r) => r.id)).toEqual([newer, older]);
    expect((await request(app).get(`/api/hospitals/${H1}/cases?sort=banana`).set(as(H1))).status).toBe(400);
  });

  it('does not list cases this hospital already rejected, or ones it was never notified about', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'no_beds' });
    expect((await request(app).get(`/api/hospitals/${H1}/cases`).set(as(H1))).body.count).toBe(0);
    expect((await request(app).get(`/api/hospitals/${H4}/cases`).set(as(H4))).body.count).toBe(1); // H4 was notified as the replacement
  });
});

describe('features 65 and 67: acceptance, first wins', () => {
  it('accepts, tells the patient, the case room, and other hospitals', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const patient = await listen(oid(500), 'patient');
    const caseRoom = await listen(id, 'case');
    const other = await listen(H2);
    const winner = await listen(H1);

    const res = await request(app).post(`/api/cases/${id}/accept`).set(as(H1));
    await settle();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'accepted', acceptedBy: H1 });
    expect(only(patient, EVENTS.EMERGENCY_ACCEPTED)[0].payload.message).toBe('Hospital 1 accepted your emergency. Ambulance being assigned.');
    expect(only(caseRoom, EVENTS.EMERGENCY_ACCEPTED)).toHaveLength(1);
    expect(only(other, EVENTS.EMERGENCY_ACCEPTED)[0].payload).toMatchObject({ acceptedByAnotherHospital: true, message: 'Accepted by another hospital' });
    expect(only(winner, EVENTS.EMERGENCY_ACCEPTED)[0].payload.acceptedByAnotherHospital).toBe(false);
    expect(stored(id).timeline.map((t) => t.event)).toContain('accepted');
  });

  it('with two simultaneous accepts, exactly one wins and the other gets 409', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const [a, b] = await Promise.all([
      request(app).post(`/api/cases/${id}/accept`).set(as(H1)),
      request(app).post(`/api/cases/${id}/accept`).set(as(H2)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error).toBe('Accepted by another hospital');
    expect([H1, H2]).toContain(stored(id).hospital);
  });

  it('a second accept from the same hospital is 409, and an unnotified hospital is 403', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    expect((await request(app).post(`/api/cases/${id}/accept`).set(as(H1))).status).toBe(200);
    expect((await request(app).post(`/api/cases/${id}/accept`).set(as(H1))).status).toBe(409);
    expect((await request(app).post(`/api/cases/${id}/accept`).set(as(H4))).status).toBe(403);
  });

  it('404 for an unknown case and 400 for a malformed id', async () => {
    expect((await request(app).post(`/api/cases/${oid(9999)}/accept`).set(as(H1))).status).toBe(404);
    expect((await request(app).post('/api/cases/abc/accept').set(as(H1))).status).toBe(400);
  });
});

describe('feature 66: rejection', () => {
  it('needs a valid reason', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const res = await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'tired' });
    expect(res.status).toBe(400);
  });

  it('records the reason, tells the patient, and notifies the next hospital', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const patient = await listen(oid(500), 'patient');
    const h4 = await listen(H4);

    const res = await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'cath_lab_busy' });
    await settle();

    expect(res.status).toBe(200);
    expect(res.body.next).toEqual({ notified: H4 });
    const c = stored(id);
    expect(c.rejectedHospitals).toEqual([H1]);
    expect(c.timeline.find((t) => t.event === 'rejected').detail).toBe('cath_lab_busy');
    expect(only(patient, EVENTS.EMERGENCY_REJECTED)[0].payload.reason).toBe('cath_lab_busy');
    expect(only(h4, EVENTS.HOSPITAL_ALERT)).toHaveLength(1);
  });

  it('rejecting twice is 409', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'other' });
    expect((await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'other' })).status).toBe(409);
  });

  it('tells the patient when every hospital has rejected', async () => {
    db.ranking = [H1, H2];
    const id = seedCase();
    await notifyHospitals(id);
    const patient = await listen(oid(500), 'patient');
    await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'no_beds' });
    const last = await request(app).post(`/api/cases/${id}/reject`).set(as(H2)).send({ reason: 'no_beds' });
    await settle();
    expect(last.body.next).toEqual({ allHospitalsBusy: true });
    expect(stored(id).allHospitalsBusy).toBe(true);
    expect(only(patient, EVENTS.EMERGENCY_REJECTED).some((e) => e.payload.allHospitalsBusy)).toBe(true);
  });
});

describe('no-answer sweep (feature 60 support)', () => {
  const LATE = () => Date.now() + 10 * 60 * 1000;

  it('moves to the next hospital once per silent hospital, even if run twice', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const h4 = await listen(H4);

    const first = await runNoAnswerSweep({ now: LATE() });
    await settle();
    const second = await runNoAnswerSweep({ now: LATE() });
    await settle();

    expect(first.handled).toBe(3); // H1, H2, H3 all silent
    expect(second.handled).toBe(0);
    expect(only(h4, EVENTS.HOSPITAL_ALERT)).toHaveLength(1);
    expect(stored(id).timedOutHospitals).toEqual([H1, H2, H3]);
    expect(stored(id).allHospitalsBusy).toBe(false); // H4 is still pending
  });

  it('marks all busy when the last candidate is silent too', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await runNoAnswerSweep({ now: LATE() }); // notifies H4
    await runNoAnswerSweep({ now: LATE() + 60 * 60 * 1000 }); // H4 silent too
    expect(stored(id).allHospitalsBusy).toBe(true);
  });

  it('does nothing for a case that was accepted', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/accept`).set(as(H2));
    const r = await runNoAnswerSweep({ now: LATE() });
    expect(r.checked).toBe(0);
    expect(stored(id).timedOutHospitals).toEqual([]);
  });
});

describe('feature 63: patient information and audit log', () => {
  it('lets a notified hospital read the record, logs it, and marks missing profile parts clearly', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const res = await request(app).get(`/api/cases/${id}/patient`).set({ ...as(H1), 'x-staff-id': oid(77) });
    expect(res.status).toBe(200);
    expect(res.body.passport.fullName).toBe('Rahul Sharma (demo)');
    expect(res.body.healthSummary).toMatchObject({ severity: 'critical', riskScore: 80 });
    expect(res.body.allergies.available).toBe(false);
    expect(res.body.twinSnapshot.note).toMatch(/Daksh/);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ action: 'view_patient_record', resourceId: id, actor: oid(77), meta: { hospital: H1 } });
  });

  it('refuses a hospital that was not notified and logs nothing', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    const res = await request(app).get(`/api/cases/${id}/patient`).set(as(H4));
    expect(res.status).toBe(403);
    expect(db.audit).toHaveLength(0);
  });

  it('after one hospital accepts, only that hospital keeps access', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/accept`).set(as(H1));
    expect((await request(app).get(`/api/cases/${id}/patient`).set(as(H2))).status).toBe(403);
    expect((await request(app).get(`/api/cases/${id}/patient`).set(as(H1))).status).toBe(200);
  });

  it('ends when the case is closed', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/accept`).set(as(H1));
    stored(id).status = 'closed';
    const res = await request(app).get(`/api/cases/${id}/patient`).set(as(H1));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/closed/);
  });
});

describe('features 68, 69, 105: doctor, checklist, milestones', () => {
  async function accepted() {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/accept`).set(as(H1));
    return id;
  }
  const doctor = (n, hospital, specialty, onDuty) => db.doctors.set(oid(n), { _id: oid(n), name: `Dr ${n}`, hospital, specialty, onDuty });

  it('assigns an on-duty cardiologist and alerts that doctor', async () => {
    doctor(600, H1, 'cardiologist', true);
    const id = await accepted();
    const doc = await listen(oid(600), 'doctor');
    const res = await request(app).post(`/api/cases/${id}/doctor`).set(as(H1)).send({ doctorId: oid(600) });
    await settle();
    expect(res.status).toBe(200);
    expect(res.body.doctor).toBe(oid(600));
    expect(only(doc, EVENTS.HOSPITAL_ALERT)[0].payload).toMatchObject({ type: 'doctor_assignment', caseId: id });
  });

  it('rejects off-duty doctors, other hospitals doctors, and non-owners', async () => {
    doctor(601, H1, 'cardiologist', false);
    doctor(602, H2, 'cardiologist', true);
    const id = await accepted();
    expect((await request(app).post(`/api/cases/${id}/doctor`).set(as(H1)).send({ doctorId: oid(601) })).status).toBe(400);
    expect((await request(app).post(`/api/cases/${id}/doctor`).set(as(H1)).send({ doctorId: oid(602) })).status).toBe(400);
    doctor(603, H2, 'cardiologist', true);
    expect((await request(app).post(`/api/cases/${id}/doctor`).set(as(H2)).send({ doctorId: oid(603) })).status).toBe(403);
  });

  it('toggles checklist items with timestamps and emits to the case room', async () => {
    const id = await accepted();
    const caseRoom = await listen(id, 'case');
    const res = await request(app).patch(`/api/cases/${id}/preparation`).set(as(H1)).send({ item: 'edBayReady', done: true });
    await settle();
    expect(res.status).toBe(200);
    expect(res.body.preparation.edBayReady.done).toBe(true);
    expect(res.body.preparation.edBayReady.at).toBeTruthy();
    expect(only(caseRoom, EVENTS.PREPARATION_UPDATE)[0].payload).toMatchObject({ item: 'edBayReady', done: true });
    expect(only(caseRoom, EVENTS.CASE_UPDATE)).toHaveLength(1);
  });

  it('validates checklist input', async () => {
    const id = await accepted();
    expect((await request(app).patch(`/api/cases/${id}/preparation`).set(as(H1)).send({ item: 'coffee', done: true })).status).toBe(400);
    expect((await request(app).patch(`/api/cases/${id}/preparation`).set(as(H1)).send({ item: 'ecgReady', done: 'yes' })).status).toBe(400);
  });

  it('starts the cath lab clock at the first alert and stops it when the team is alerted', async () => {
    const id = await accepted();
    let res = await request(app).get(`/api/cases/${id}`).set(as(H1));
    expect(res.body.goldenHour[0].status).toBe('running');
    res = await request(app).patch(`/api/cases/${id}/preparation`).set(as(H1)).send({ item: 'cathLabTeamAlerted', done: true });
    expect(res.body.goldenHour[0].status).toBe('done');
  });

  it('records first contact and treatment start once', async () => {
    const id = await accepted();
    let res = await request(app).post(`/api/cases/${id}/milestones`).set(as(H1)).send({ name: 'firstMedicalContact' });
    expect(res.body.goldenHour[2].status).toBe('running');
    const firstStamp = stored(id).firstMedicalContactAt;
    await request(app).post(`/api/cases/${id}/milestones`).set(as(H1)).send({ name: 'firstMedicalContact' });
    expect(stored(id).firstMedicalContactAt).toBe(firstStamp); // unchanged
    res = await request(app).post(`/api/cases/${id}/milestones`).set(as(H1)).send({ name: 'treatmentStarted' });
    expect(res.body.goldenHour[2].status).toBe('done');
    expect((await request(app).post(`/api/cases/${id}/milestones`).set(as(H1)).send({ name: 'lunch' })).status).toBe(400);
  });
});

describe('feature 70: timeline', () => {
  it('returns every step in order, with the golden-hour stages', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    await request(app).post(`/api/cases/${id}/reject`).set(as(H1)).send({ reason: 'no_beds' });
    await request(app).post(`/api/cases/${id}/accept`).set(as(H2));
    await request(app).patch(`/api/cases/${id}/preparation`).set(as(H2)).send({ item: 'ecgReady', done: true });

    const res = await request(app).get(`/api/cases/${id}/timeline`).set(as(H2));
    expect(res.status).toBe(200);
    const events = res.body.timeline.map((t) => t.event);
    expect(events[0]).toBe('detected');
    expect(events).toEqual(expect.arrayContaining(['hospital_notified', 'rejected', 'accepted', 'ecgReady_done']));
    const times = res.body.timeline.map((t) => new Date(t.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(res.body.goldenHour).toHaveLength(3);
  });

  it('is closed to hospitals that were never involved', async () => {
    const id = seedCase();
    await notifyHospitals(id);
    expect((await request(app).get(`/api/cases/${id}/timeline`).set(as(H4))).status).toBe(403);
  });
});
