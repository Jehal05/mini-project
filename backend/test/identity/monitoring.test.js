// Access control for monitoring, detection and emergency (Daksh's modules behind Jehal's auth),
// plus the pieces that connect them: case numbers, audit entries, first aid and contact alerts.
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createMonitoring } from '../../src/monitoring.js';
import { Admission, AuditLog, EmergencyCase, HospitalCase, Patient } from '../../src/models/index.js';
import { bearer, loginAs, makeHospital, makeUser, patientSession } from './helpers.js';

let monitoring;
let app;
let server;
let ioServer;
let port;

beforeAll(async () => {
  server = http.createServer();
  ioServer = new Server(server);
  monitoring = await createMonitoring({ io: ioServer, autoStart: false, logger: { warn() {}, error() {}, log() {} }, simulationOptions: { monitorAll: false } });
  app = createApp({ extraApi: monitoring.extraApi });
  server.on('request', app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterAll(async () => {
  monitoring.stop();
  ioServer.close();
  await new Promise((resolve) => server.close(resolve));
});

const get = (token, url) => request(app).get(url).set(bearer(token));
const monitored = async (s) => { await monitoring.engine.addPatient((await Patient.findById(s.patient._id)).toObject()); return s; };
const staffOf = async (hospital, role = 'hospital_staff') => { const user = await makeUser({ role, hospital }); return (await loginAs(user)).token; };
const accept = (hospital, patient, status = 'accepted') => HospitalCase.create({ hospital: hospital._id, emergencyCaseId: String(patient._id), patient: patient._id, status });

describe('who may read a patient (REST)', () => {
  it('needs a login', async () => {
    for (const url of ['/api/sim/patients', '/api/detection/status', '/api/detection/config', '/api/emergency/first-aid?patient=HT-2026-0001']) {
      expect((await request(app).get(url)).status, url).toBe(401);
    }
  });

  it('lets a patient read only themself, and answers a stranger exactly like an unknown id', async () => {
    const a = await monitored(await patientSession());
    const b = await monitored(await patientSession());
    expect((await get(a.token, `/api/sim/patients/${a.patient.patientId}`)).status).toBe(200);
    const foreign = await get(a.token, `/api/sim/patients/${b.patient.patientId}`);
    const unknown = await get(a.token, '/api/sim/patients/HT-2099-9999');
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(unknown.body);
    for (const url of ['vitals/latest', 'timeline', 'trends']) {
      expect((await get(a.token, `/api/sim/patients/${b.patient._id}/${url}`)).status, url).toBe(404);
    }
    expect((await get(a.token, `/api/detection/patients/${b.patient._id}/status`)).status).toBe(404);
    expect((await get(a.token, `/api/detection/patients/${b.patient._id}/detections`)).status).toBe(404);
  });

  it('lists only the patients you may see', async () => {
    const a = await monitored(await patientSession());
    await monitored(await patientSession());
    const mine = await get(a.token, '/api/sim/patients');
    expect(mine.body.map((p) => p.patientCode)).toEqual([a.patient.patientId]);
    const status = await get(a.token, '/api/detection/status');
    expect(status.body.map((s) => s.patientId)).toEqual([String(a.patient._id)]);
    const admin = await loginAs(await makeUser({ role: 'central_admin' }));
    expect((await get(admin.token, '/api/sim/patients')).body.length).toBeGreaterThanOrEqual(2);
  });

  it('gives hospital staff a patient only while the hospital has accepted them, and logs the view once', async () => {
    const h = await makeHospital();
    const other = await makeHospital('Other Hospital');
    const p = await monitored(await patientSession());
    const staff = await staffOf(h);
    const url = `/api/sim/patients/${p.patient._id}`;
    expect((await get(staff, url)).status).toBe(404); // nothing yet
    await accept(h, p.patient, 'received');
    expect((await get(staff, url)).status).toBe(404); // told, but not accepted: no live data
    await HospitalCase.updateOne({ hospital: h._id }, { status: 'accepted' });
    expect((await get(staff, url)).status).toBe(200);
    expect((await get(staff, `${url}/vitals/latest`)).status).toBe(200);
    expect((await get(await staffOf(other), url)).status).toBe(404); // another hospital
    const logged = await AuditLog.find({ action: 'record.view', resourceId: String(p.patient._id) });
    expect(logged).toHaveLength(1); // two reads, one entry
    expect(logged[0].meta).toEqual({ kind: 'live_monitoring' });
    expect(JSON.stringify(logged[0])).not.toMatch(/heartRate|spo2/i);
  });

  it('also lets a hospital see a patient it has admitted', async () => {
    const h = await makeHospital();
    const p = await monitored(await patientSession());
    await Admission.create({ hospital: h._id, patient: p.patient._id, patientId: p.patient.patientId, patientName: 'X', bed: h._id, bedLabel: 'B1', ward: 'general', doctor: h._id, doctorName: 'Dr', status: 'admitted' });
    expect((await get(await staffOf(h), `/api/sim/patients/${p.patient._id}`)).status).toBe(200);
  });
});

describe('who may change settings and run demos', () => {
  it('limits the detection settings to the central admin and per-patient thresholds to doctors', async () => {
    const h = await makeHospital();
    const p = await monitored(await patientSession());
    await accept(h, p.patient);
    const admin = (await loginAs(await makeUser({ role: 'central_admin' }))).token;
    const doctor = (await loginAs(await makeUser({ role: 'doctor', hospital: h }))).token;
    const put = (token, url, body) => request(app).put(url).set(bearer(token)).send(body);
    const config = { thresholds: { hr: { normal: [55, 100] } } };

    expect((await put(p.token, '/api/detection/config', config)).status).toBe(403);
    expect((await put(doctor, '/api/detection/config', config)).status).toBe(403);
    expect((await put(admin, '/api/detection/config', config)).status).toBe(200);

    const th = { thresholds: { hr: { normal: [55, 105] } } };
    expect((await put(p.token, `/api/detection/patients/${p.patient._id}/thresholds`, th)).status).toBe(403);
    expect((await put(doctor, `/api/detection/patients/${p.patient._id}/thresholds`, th)).status).toBe(200);
    const stranger = (await loginAs(await makeUser({ role: 'doctor', hospital: await makeHospital('Elsewhere') }))).token;
    expect((await put(stranger, `/api/detection/patients/${p.patient._id}/thresholds`, th)).status).toBe(404); // not their patient

    const scenario = (token) => request(app).post(`/api/sim/patients/${p.patient._id}/scenario`).set(bearer(token)).send({ scenario: 'stable' });
    expect((await scenario(p.token)).status).toBe(403);
    expect((await scenario(doctor)).status).toBe(403);
    expect((await scenario(admin)).status).toBe(200);
  });

  it('writes both setting changes to the audit log with who and where', async () => {
    const admin = await loginAs(await makeUser({ role: 'central_admin' }));
    await request(app).put('/api/detection/config').set(bearer(admin.token)).send({ thresholds: { hr: { normal: [58, 100] } } }).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    const row = await AuditLog.findOne({ action: 'threshold.update' });
    expect(row.role).toBe('central_admin');
    expect(String(row.actor)).toBe(String(admin.res.body.user.id));
    expect(row.resourceId).toBe('global');
    expect(row.meta.summary).toMatch(/Changed/);
  });
});

describe('emergency cases', () => {
  it('lets a patient start SOS for themself only, and numbers cases from the shared counter', async () => {
    const a = await monitored(await patientSession());
    const b = await monitored(await patientSession());
    const sos = (s, body = {}) => request(app).post('/api/emergency/sos').set(bearer(s.token)).send(body);
    expect((await sos(a, { patient: b.patient.patientId })).body.case.patientCode).toBe(a.patient.patientId); // the token wins
    const first = await sos(a);
    expect(first.status).toBe(200); // joined the open case
    const bCase = await sos(b);
    expect(bCase.status).toBe(201);
    const numbers = (await EmergencyCase.find().sort({ createdAt: 1 })).map((c) => c.caseNumber);
    const year = new Date().getFullYear();
    expect(numbers).toEqual([`EC-${year}-0001`, `EC-${year}-0002`]);
  });

  it('keeps one patient out of another patient’s case', async () => {
    const a = await monitored(await patientSession());
    const b = await monitored(await patientSession());
    const made = await request(app).post('/api/emergency/sos').set(bearer(a.token)).send({});
    const id = made.body.case.id;
    expect((await get(a.token, `/api/emergency/${id}`)).status).toBe(200);
    for (const [method, path, body] of [['get', ''], ['post', '/cancel', { reason: 'other' }], ['put', '/symptoms', { symptoms: {} }], ['post', '/confirm', {}], ['put', '/location', { latitude: 18.5, longitude: 73.8 }], ['post', '/ack', {}]]) {
      const res = await request(app)[method](`/api/emergency/${id}${path}`).set(bearer(b.token)).send(body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect((await request(app).get('/api/emergency/mine').query({ patient: a.patient.patientId }).set(bearer(b.token))).body.items ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    expect((await EmergencyCase.findById(id)).status).not.toBe('cancelled');
  });

  it('lets the hospital that accepted a case read and cancel it, but not press SOS for the patient', async () => {
    const h = await makeHospital();
    const a = await monitored(await patientSession());
    const made = await request(app).post('/api/emergency/sos').set(bearer(a.token)).send({});
    const id = made.body.case.id;
    const staff = await staffOf(h);
    expect((await get(staff, `/api/emergency/${id}`)).status).toBe(404);
    await HospitalCase.create({ hospital: h._id, emergencyCaseId: id, patient: a.patient._id, status: 'accepted' });
    expect((await get(staff, `/api/emergency/${id}`)).status).toBe(200);
    expect((await request(app).post(`/api/emergency/${id}/confirm`).set(bearer(staff)).send({})).status).toBe(404);
    expect((await request(app).post('/api/emergency/sos').set(bearer(staff)).send({ patient: a.patient.patientId })).status).toBe(404);
  });

  it('alerts the contacts from the patient’s own profile, closest priority first', async () => {
    const s = await monitored(await patientSession());
    await request(app).post('/api/patients/me/contacts').set(bearer(s.token)).send({ name: 'Second Contact', relation: 'Brother', phone: '+91 98765 43211', priority: 2 }).expect(201);
    await request(app).post('/api/patients/me/contacts').set(bearer(s.token)).send({ name: 'First Contact', relation: 'Spouse', phone: '+91 98765 43210', email: 'first@example.com', priority: 1 }).expect(201);
    const made = await request(app).post('/api/emergency/sos').set(bearer(s.token)).send({});
    await new Promise((r) => setTimeout(r, 100));
    const stored = await EmergencyCase.findById(made.body.case.id).lean();
    expect(stored.contactAlerts.map((c) => c.name)).toEqual(['First Contact', 'Second Contact']);
    expect(stored.contactAlerts[0].channels).toContain('email');
  });

  it('shows aspirin advice only for a medication and allergy list the patient has confirmed', async () => {
    const s = await monitored(await patientSession());
    const aid = async () => (await get(s.token, '/api/emergency/first-aid')).body.aspirin;
    expect(await aid()).toMatchObject({ shown: false, reason: 'incomplete_record' }); // nothing filled in
    await request(app).put('/api/patients/me/allergies/confirm-none').set(bearer(s.token)).expect(200);
    expect(await aid()).toMatchObject({ shown: false, reason: 'incomplete_record' }); // medicines still unknown
    await request(app).put('/api/patients/me/medications/confirm-none').set(bearer(s.token)).expect(200);
    expect(await aid()).toEqual({ shown: true, reason: 'record_clear' });
    await request(app).post('/api/patients/me/allergies').set(bearer(s.token)).send({ allergen: 'Aspirin', severity: 'severe' }).expect(201);
    expect(await aid()).toMatchObject({ shown: false, reason: 'aspirin_allergy' });
  });

  it('refuses “no known allergies” while the list has entries', async () => {
    const s = await patientSession();
    await request(app).post('/api/patients/me/allergies').set(bearer(s.token)).send({ allergen: 'Penicillin', severity: 'mild' }).expect(201);
    const res = await request(app).put('/api/patients/me/allergies/confirm-none').set(bearer(s.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIST_NOT_EMPTY');
  });
});

describe('Socket.IO', () => {
  const open = (token) => connect(`http://127.0.0.1:${port}`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
  const ready = (socket) => new Promise((resolve, reject) => { socket.on('connect', () => resolve(socket)); socket.on('connect_error', reject); });
  const ask = (socket, patientId) => new Promise((resolve) => socket.emit('vitals:subscribe', { patientId }, resolve));

  it('refuses a connection without a valid token', async () => {
    await expect(ready(open())).rejects.toThrow(/Authentication required/);
    await expect(ready(open('not-a-token'))).rejects.toThrow();
  });

  it('lets a patient follow themself but not someone else', async () => {
    const a = await monitored(await patientSession());
    const b = await monitored(await patientSession());
    const socket = await ready(open(a.token));
    try {
      expect((await ask(socket, String(a.patient._id))).ok).toBe(true);
      expect((await ask(socket, String(b.patient._id))).error).toMatch(/Not allowed/);
    } finally { socket.close(); }
  });

  it('lets hospital staff follow only a patient the hospital has accepted', async () => {
    const h = await makeHospital();
    const p = await monitored(await patientSession());
    const socket = await ready(open(await staffOf(h)));
    try {
      expect((await ask(socket, String(p.patient._id))).error).toMatch(/Not allowed/);
      await accept(h, p.patient);
      expect((await ask(socket, String(p.patient._id))).ok).toBe(true);
    } finally { socket.close(); }
  });

  it('puts a signed-out session’s token out of use at once', async () => {
    const a = await patientSession();
    await a.agent.post('/api/auth/logout').set({ 'X-Requested-With': 'healthtwin' });
    await expect(ready(open(a.token))).rejects.toThrow(/session has ended/i);
  });
});
