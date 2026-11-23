// Web Push for hospital staff (61) and emergency contacts (47).
import http from 'node:http';
import { Server } from 'socket.io';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createMonitoring } from '../../src/monitoring.js';
import { Ambulance, Bed, Doctor, EmergencyCase, Hospital, Patient, PushSubscription } from '../../src/models/index.js';
import { bearer, loginAs, makeUser, patientSession } from './helpers.js';

const fake = { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) };
let monitoring;
let app;
let server;
let ioServer;

beforeAll(async () => {
  server = http.createServer();
  ioServer = new Server(server);
  monitoring = await createMonitoring({
    io: ioServer, autoStart: false, logger: { warn() {}, error() {}, log() {} }, simulationOptions: { monitorAll: false },
    responseOptions: { ambulance: { speedKmh: 3600 }, push: { env: { VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key' }, push: fake } },
  });
  app = createApp({ extraApi: monitoring.extraApi });
  server.on('request', app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
afterAll(async () => {
  monitoring.stop(); ioServer.close();
  await new Promise((r) => server.close(r));
});

const PATIENT_AT = [73.8567, 18.5204];
let n = 0;
async function hospital() {
  n += 1;
  const h = await Hospital.create({ name: `Push Hospital ${n} ${Date.now()}`, address: 'Pune', location: { type: 'Point', coordinates: [PATIENT_AT[0] + 0.009, PATIENT_AT[1]] }, capabilities: { cathLab: true, ccuBeds: 2, icuBeds: 2, cardiologist24x7: true, alsAmbulances: 1 } });
  await Bed.insertMany([{ hospital: h._id, type: 'ccu', label: 'C1' }, { hospital: h._id, type: 'ccu', label: 'C2' }]);
  await Doctor.create({ hospital: h._id, fullName: 'Dr Push', specialization: 'Cardiology', isCardiologist: true, onDuty: true });
  await Ambulance.create({ hospital: h._id, vehicleNumber: `MH12${Date.now() % 100000}P`, type: 'ALS', position: h.location });
  return h;
}
const sub = (id) => ({ endpoint: `https://push.example/${id}`, keys: { p256dh: 'p256', auth: 'auth' } });
const settle = () => new Promise((r) => setTimeout(r, 80));

describe('web push', () => {
  it('publishes the public key, and only the public one', async () => {
    const res = await request(app).get('/api/push/public-key');
    expect(res.body).toEqual({ enabled: true, publicKey: 'pub-key' });
    expect(JSON.stringify(res.body)).not.toContain('priv-key');
  });

  it('lets hospital users subscribe, refuses patients and junk, and tells staff about a new case without naming the patient', async () => {
    await Hospital.updateMany({}, { isActive: false });
    const h = await hospital();
    const t = (await loginAs(await makeUser({ role: 'hospital_staff', hospital: h }))).token;
    const p = await patientSession();

    expect((await request(app).post('/api/push/subscribe').set(bearer(p.token)).send({ subscription: sub('x') })).status).toBe(403);
    expect((await request(app).post('/api/push/subscribe').set(bearer(t)).send({ subscription: { endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } } })).status).toBe(400);
    expect((await request(app).post('/api/push/subscribe').set(bearer(t)).send({ subscription: sub('staff1') })).status).toBe(200);
    expect((await request(app).post('/api/push/subscribe').set(bearer(t)).send({ subscription: sub('staff1') })).status).toBe(200); // same device twice: one row
    expect(await PushSubscription.countDocuments({ kind: 'staff', hospital: h._id })).toBe(1);

    fake.sendNotification.mockClear();
    await request(app).post('/api/emergency/sos').set(bearer(p.token)).send({ location: { lng: PATIENT_AT[0], lat: PATIENT_AT[1] } });
    await settle();
    const sent = fake.sendNotification.mock.calls.filter((c) => c[0].endpoint === 'https://push.example/staff1');
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0][1]);
    expect(body).toMatchObject({ title: expect.stringMatching(/needs a response/), url: '/hospital/incoming' });
    expect(JSON.stringify(body)).not.toContain(p.patient.patientId);
  });

  it('removes a subscription the push service says is gone', async () => {
    const h = await hospital();
    await PushSubscription.create({ kind: 'staff', hospital: h._id, endpoint: 'https://push.example/gone', keys: { p256dh: 'a', auth: 'b' } });
    fake.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    await monitoring.pusher.toHospital(h._id, { title: 't' });
    expect(await PushSubscription.countDocuments({ endpoint: 'https://push.example/gone' })).toBe(0);
  });

  it('saves a contact device from the status link and pushes updates, and rejects a bad link', async () => {
    const p = await patientSession();
    await Patient.updateOne({ _id: p.patient._id }, { $set: { emergencyContacts: [{ name: 'Asha', relation: 'Wife', phone: '+919800000001', email: 'asha@example.com', priority: 1 }] } });
    const made = (await request(app).post('/api/emergency/sos').set(bearer(p.token)).send({})).body.case;
    await settle();
    const stored = await EmergencyCase.findById(made.id).lean();
    const token = stored.contactAlerts[0].statusLinkToken;
    expect(stored.contactAlerts[0].contactId).toBeTruthy();

    expect((await request(app).post('/api/push/contact/not-a-token').send({ subscription: sub('c0') })).status).toBe(404);
    expect((await request(app).post(`/api/push/contact/${token}`).send({ subscription: sub('contact1') })).status).toBe(200);

    fake.sendNotification.mockClear();
    await monitoring.pusher.toContacts(made.id, { title: 'A hospital accepted', body: 'x' });
    const call = fake.sendNotification.mock.calls.find((c) => c[0].endpoint === 'https://push.example/contact1');
    expect(JSON.parse(call[1])).toMatchObject({ title: 'A hospital accepted', url: `/status/${token}` });

    // a later emergency alerts that device straight away
    await EmergencyCase.updateOne({ _id: made.id }, { $set: { status: 'cancelled', closedAt: new Date() } });
    fake.sendNotification.mockClear();
    await request(app).post('/api/emergency/sos').set(bearer(p.token)).send({});
    await settle();
    expect(fake.sendNotification.mock.calls.some((c) => c[0].endpoint === 'https://push.example/contact1')).toBe(true);
  });
});
