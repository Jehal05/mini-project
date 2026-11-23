// Hospital discovery, notification, acceptance, rejection and the ambulance trip (features 51-80, 95, 105).
import http from 'node:http';
import { Server } from 'socket.io';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createMonitoring } from '../../src/monitoring.js';
import { Ambulance, AuditLog, Bed, Doctor, EmergencyCase, Hospital, HospitalCase, Patient } from '../../src/models/index.js';
import { bearer, loginAs, makeUser, patientSession } from './helpers.js';

let monitoring;
let app;
let server;
let ioServer;

beforeAll(async () => {
  server = http.createServer();
  ioServer = new Server(server);
  monitoring = await createMonitoring({ io: ioServer, autoStart: false, logger: { warn() {}, error() {}, log() {} }, simulationOptions: { monitorAll: false }, responseOptions: { ambulance: { speedKmh: 3600 } } });
  app = createApp({ extraApi: monitoring.extraApi });
  server.on('request', app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});
afterAll(async () => {
  monitoring.stop();
  ioServer.close();
  await new Promise((resolve) => server.close(resolve));
});

const PATIENT_AT = [73.8567, 18.5204]; // Pune centre
let n = 0;
async function hospital({ name, offsetKm = 1, cathLab = true, cardiologist = true, ccu = 2, als = 1 } = {}) {
  n += 1;
  const h = await Hospital.create({ name: name ?? `Response Hospital ${n} ${Date.now()}`, address: `Area ${n}, Pune`, location: { type: 'Point', coordinates: [PATIENT_AT[0] + offsetKm * 0.009, PATIENT_AT[1]] }, capabilities: { cathLab, ccuBeds: ccu, icuBeds: 2, cardiologist24x7: cardiologist, alsAmbulances: als } });
  await Bed.insertMany(Array.from({ length: ccu }, (_, i) => ({ hospital: h._id, type: 'ccu', label: `CCU-${i + 1}` })));
  if (cardiologist) await Doctor.create({ hospital: h._id, fullName: `Dr Cardio ${n}`, specialization: 'Cardiology', isCardiologist: true, onDuty: true });
  return h;
}
const staff = async (h, role = 'hospital_staff') => (await loginAs(await makeUser({ role, hospital: h }))).token;
const sos = async (s) => (await request(app).post('/api/emergency/sos').set(bearer(s.token)).send({ location: { lng: PATIENT_AT[0], lat: PATIENT_AT[1] } })).body.case;
const call = (method, token, url, body) => request(app)[method](url).set(bearer(token)).send(body);
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('finding hospitals (53-59)', () => {
  it('ranks by distance, capability and load, shows the breakdown, and filters for cardiac care', async () => {
    const near = await hospital({ offsetKm: 1 });
    const far = await hospital({ offsetKm: 12, cathLab: false, cardiologist: false, ccu: 0 });
    const s = await patientSession();
    const res = await call('get', s.token, `/api/hospitals/nearby?lng=${PATIENT_AT[0]}&lat=${PATIENT_AT[1]}&radiusKm=30`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((h) => h.id);
    expect(ids.indexOf(String(near._id))).toBeLessThan(ids.indexOf(String(far._id)));
    const top = res.body.items.find((h) => h.id === String(near._id));
    expect(top.breakdown).toEqual({ distance: expect.any(Number), capability: 40, load: 20 });
    expect(top.score).toBe(top.breakdown.distance + 40 + 20);
    expect(top.capability).toMatchObject({ cathLab: true, cardiologistOnDuty: true, freeCcu: 2 });

    const cardiac = await call('get', s.token, `/api/hospitals/nearby?lng=${PATIENT_AT[0]}&lat=${PATIENT_AT[1]}&cardiac=1`);
    expect(cardiac.body.items.map((h) => h.id)).toContain(String(near._id));
    expect(cardiac.body.items.map((h) => h.id)).not.toContain(String(far._id));
    const byName = await call('get', s.token, `/api/hospitals/nearby?lng=${PATIENT_AT[0]}&lat=${PATIENT_AT[1]}&q=${encodeURIComponent(far.name)}`);
    expect(byName.body.items.map((h) => h.id)).toEqual([String(far._id)]);
    expect((await request(app).get('/api/hospitals/nearby?lng=1&lat=1')).status).toBe(401);
    expect((await call('get', s.token, '/api/hospitals/nearby')).status).toBe(400);
  });
});

describe('an emergency from SOS to arrival', () => {
  it('notifies the top three, the first accept wins, an ambulance is sent, and the trip runs to the hospital', async () => {
    await Hospital.updateMany({}, { isActive: false });
    const [h1, h2, h3, h4] = [await hospital({ offsetKm: 1 }), await hospital({ offsetKm: 2 }), await hospital({ offsetKm: 3 }), await hospital({ offsetKm: 5 })];
    const alsCar = await Ambulance.create({ hospital: h1._id, vehicleNumber: `MH12${Date.now() % 10000}A`, type: 'ALS', position: h1.location });
    const blsCar = await Ambulance.create({ hospital: h1._id, vehicleNumber: `MH12${Date.now() % 10000}B`, type: 'BLS', position: h1.location });
    const p = await patientSession();
    const c = await sos(p);
    await settle();

    const told = await HospitalCase.find({ emergencyCaseId: c.id });
    expect(told.map((t) => String(t.hospital)).sort()).toEqual([h1, h2, h3].map((h) => String(h._id)).sort()); // the fourth is not told yet
    const stored = await EmergencyCase.findById(c.id).lean();
    expect(stored.hospitalResponses.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(stored.timeline.filter((e) => e.type === 'hospital_notified')).toHaveLength(3);

    const t1 = await staff(h1);
    const t2 = await staff(h2);
    const queue = await call('get', t1, '/api/response/incoming');
    expect(queue.body.items[0]).toMatchObject({ id: c.id, needsResponse: true, severity: 3, patientCode: p.patient.patientId });

    // first to accept wins; the other is told it was taken
    const won = await call('post', t1, `/api/response/cases/${c.id}/accept`);
    expect(won.status).toBe(200);
    expect(won.body.case.status).toBe('ambulance_assigned');
    expect(won.body.ambulanceAssigned).toBe(true);
    const lost = await call('post', t2, `/api/response/cases/${c.id}/accept`);
    expect(lost.status).toBe(409);
    expect(lost.body.error).toMatchObject({ code: 'ACCEPTED_BY_OTHER', message: 'Accepted by another hospital' });
    expect((await HospitalCase.findOne({ hospital: h2._id, emergencyCaseId: c.id })).status).toBe('rejected');
    expect((await HospitalCase.findOne({ hospital: h1._id, emergencyCaseId: c.id })).status).toBe('accepted');
    expect((await call('get', t2, '/api/response/incoming')).body.items).toHaveLength(0);

    // ALS preferred for a cardiac case
    const sent = await Ambulance.findOne({ 'trip.caseId': c.id });
    expect(String(sent._id)).toBe(String(alsCar._id));
    expect((await Ambulance.findById(blsCar._id)).status).toBe('available');

    // the accepting hospital can now watch the patient live; the patient can follow the case
    expect((await call('get', t1, `/api/sim/patients/${p.patient._id}`)).status).toBe(200); // accepted: live vitals open up
    expect((await call('get', t2, `/api/sim/patients/${p.patient._id}`)).status).toBe(404); // lost: they stay closed
    const track = await call('get', p.token, `/api/response/track/${c.id}`);
    expect(track.status).toBe(200);
    expect(track.body.hospital.name).toBe(h1.name);
    expect(track.body.ambulance).toMatchObject({ stage: 'en_route', vehicleNumber: alsCar.vehicleNumber, simulated: true });
    expect(track.body.ambulance.route.toPatient.length).toBeGreaterThan(2);
    expect(track.body.alternatives).toHaveLength(3);

    // preparation and doctor
    const doctor = await Doctor.findOne({ hospital: h1._id });
    expect((await call('post', t1, `/api/response/cases/${c.id}/doctor`, { doctorId: String(doctor._id) })).status).toBe(200);
    const prep = await call('put', t1, `/api/response/cases/${c.id}/preparation`, { cathLabTeamAlerted: true, edBayReady: true });
    expect(prep.body).toMatchObject({ cathLabTeamAlerted: true, edBayReady: true, ccuBedReserved: false });
    expect((await call('put', t1, `/api/response/cases/${c.id}/preparation`, { nonsense: true })).status).toBe(400);

    // the trip: simulated movement, then the crew buttons
    const crew = await staff(h1);
    expect((await call('post', crew, `/api/response/cases/${c.id}/trip`, { stage: 'patient_on_board' })).status).toBe(409); // cannot skip a stage
    await monitoring.ambulances.tick(60_000);
    expect((await Ambulance.findById(alsCar._id)).trip.stage).toBe('at_patient');
    expect((await call('post', crew, `/api/response/cases/${c.id}/trip`, { stage: 'patient_on_board' })).status).toBe(200);
    expect((await EmergencyCase.findById(c.id)).status).toBe('patient_on_board');
    expect((await call('post', crew, `/api/response/cases/${c.id}/trip`, { stage: 'en_route_to_hospital' })).status).toBe(200);
    expect((await call('post', crew, `/api/response/cases/${c.id}/arrival`)).status).toBe(409); // not there yet
    await monitoring.ambulances.tick(600_000);
    expect((await Ambulance.findById(alsCar._id)).trip.stage).toBe('at_hospital');
    const arrived = await call('post', crew, `/api/response/cases/${c.id}/arrival`);
    expect(arrived.status).toBe(200);
    const done = await EmergencyCase.findById(c.id).lean();
    expect(done.status).toBe('arrived');
    expect((await HospitalCase.findOne({ hospital: h1._id, emergencyCaseId: c.id })).status).toBe('arrived');
    expect((await Ambulance.findById(alsCar._id)).status).toBe('available');
    const stages = done.timeline.filter((e) => e.type === 'trip_stage').map((e) => e.data.stage);
    expect(stages).toEqual(['at_patient', 'patient_on_board', 'en_route_to_hospital', 'at_hospital']);

    const golden = (await call('get', p.token, `/api/response/track/${c.id}`)).body.goldenHour;
    expect(golden.map((g) => g.key)).toEqual(['cathLab', 'scene', 'treatment']);
    expect(golden[0].state).toBe('done');
    expect((await AuditLog.find({ action: 'emergency.accept', resourceId: c.id })).length).toBe(1);
  });

  it('moves to the next hospital when one rejects, and refuses a bad reason', async () => {
    await Hospital.updateMany({}, { isActive: false });
    const hs = [await hospital({ offsetKm: 1 }), await hospital({ offsetKm: 2 }), await hospital({ offsetKm: 3 }), await hospital({ offsetKm: 4 })];
    const p = await patientSession();
    const c = await sos(p);
    await settle();
    const t = await staff(hs[0]);
    expect((await call('post', t, `/api/response/cases/${c.id}/reject`, { reason: 'because' })).status).toBe(400);
    const res = await call('post', t, `/api/response/cases/${c.id}/reject`, { reason: 'no_beds' });
    expect(res.status).toBe(200);
    expect(res.body.nextNotified).toHaveLength(1);
    expect(String(res.body.nextNotified[0].hospital)).toBe(String(hs[3]._id));
    const stored = await EmergencyCase.findById(c.id).lean();
    expect(stored.hospitalResponses.find((r) => String(r.hospital) === String(hs[0]._id))).toMatchObject({ status: 'rejected', rejectReason: 'no_beds' });
    expect((await call('post', t, `/api/response/cases/${c.id}/reject`, { reason: 'no_beds' })).status).toBe(409); // already answered
    expect((await call('get', t, `/api/response/cases/${c.id}`)).status).toBe(404); // a rejecting hospital loses access
  });

  it('shares the handover only with a hospital that was told, and logs every view', async () => {
    await Hospital.updateMany({}, { isActive: false });
    const [told, stranger] = [await hospital({ offsetKm: 1 }), await hospital({ offsetKm: 40 })];
    const p = await patientSession();
    const patient = await Patient.findById(p.patient._id);
    patient.allergies.push({ allergen: 'Penicillin', severity: 'severe' });
    await patient.save();
    const c = await sos(p);
    await settle();
    const t = await staff(told);
    const r = await call('get', t, `/api/response/cases/${c.id}`);
    expect(r.status).toBe(200);
    expect(r.body.handover.passport.severeAllergies[0].allergen).toBe('Penicillin');
    expect(r.body.handover.healthSummary.text).toMatch(/Penicillin/);
    expect(await AuditLog.countDocuments({ action: 'record.view', resourceId: c.id, 'meta.kind': 'emergency_handover' })).toBe(1);
    expect((await call('get', await staff(stranger), `/api/response/cases/${c.id}`)).status).toBe(404);
    expect((await call('get', (await patientSession()).token, `/api/response/track/${c.id}`)).status).toBe(404); // another patient
    expect((await call('get', p.token, '/api/response/incoming')).status).toBe(403); // patients have no hospital queue
  });

  it('releases the ambulance when the patient cancels', async () => {
    await Hospital.updateMany({}, { isActive: false });
    const h = await hospital({ offsetKm: 1 });
    const car = await Ambulance.create({ hospital: h._id, vehicleNumber: `MH14${Date.now() % 10000}C`, type: 'ALS', position: h.location });
    const p = await patientSession();
    const c = await sos(p);
    await settle();
    await call('post', await staff(h), `/api/response/cases/${c.id}/accept`);
    expect((await Ambulance.findById(car._id)).status).toBe('dispatched');
    await call('post', p.token, `/api/emergency/${c.id}/cancel`, { reason: 'false_alarm' });
    await monitoring.ambulances.tick();
    expect((await Ambulance.findById(car._id)).status).toBe('available');
  });
});

describe('ambulance fleet (71, 72)', () => {
  it('registers a vehicle for the staff member’s own hospital only, and refuses duplicates', async () => {
    const h = await hospital();
    const t = await staff(h);
    const reg = await call('post', t, '/api/response/ambulances', { vehicleNumber: `mh12 zz ${Date.now() % 10000}`, type: 'ALS', crew: [{ name: 'Driver One', role: 'Driver', phone: '+912000000099' }], equipment: ['Defibrillator'] });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ type: 'ALS', status: 'available', hospital: String(h._id) });
    expect((await call('post', t, '/api/response/ambulances', { vehicleNumber: reg.body.vehicleNumber })).status).toBe(409);
    expect((await call('post', t, '/api/response/ambulances', { vehicleNumber: 'X1', type: 'JET' })).status).toBe(400);
    const list = await call('get', t, '/api/response/ambulances');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.counts).toMatchObject({ available: 1, maintenance: 0 });
    expect((await call('patch', t, `/api/response/ambulances/${reg.body._id}`, { status: 'maintenance' })).body.status).toBe('maintenance');
    expect((await call('post', await staff(h, 'doctor'), '/api/response/ambulances', { vehicleNumber: 'D1' })).status).toBe(403);
    expect((await call('get', await staff(await hospital()), '/api/response/ambulances')).body.items).toHaveLength(0);
  });
});
