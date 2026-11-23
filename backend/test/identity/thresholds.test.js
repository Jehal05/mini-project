// Feature 36: global detection settings (central admin) and per-patient overrides (doctor).
import http from 'node:http';
import { Server } from 'socket.io';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createMonitoring } from '../../src/monitoring.js';
import { Hospital } from '../../src/models/index.js';
import { bearer, loginAs, makeUser, patientSession } from './helpers.js';

let monitoring; let app; let server; let ioServer;
beforeAll(async () => {
  server = http.createServer();
  ioServer = new Server(server);
  monitoring = await createMonitoring({ io: ioServer, autoStart: false, logger: { warn() {}, error() {}, log() {} }, simulationOptions: { monitorAll: true } });
  app = createApp({ extraApi: monitoring.extraApi });
  server.on('request', app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
afterAll(async () => { monitoring.stop(); ioServer.close(); await new Promise((r) => server.close(r)); });

describe('detection settings (36)', () => {
  it('lets only a central admin change the global thresholds, and logs the change', async () => {
    const admin = (await loginAs(await makeUser({ role: 'central_admin' }))).token;
    const p = await patientSession();
    expect((await request(app).put('/api/detection/config').set(bearer(p.token)).send({ thresholds: { hr: { normal: [55, 105] } } })).status).toBe(403);
    const ok = await request(app).put('/api/detection/config').set(bearer(admin)).send({ thresholds: { hr: { normal: [55, 105] } } });
    expect(ok.status).toBe(200);
    expect(ok.body.effective.thresholds.hr.normal).toEqual([55, 105]);
    expect(ok.body.changes.at(-1)).toMatchObject({ scope: 'global', actorRole: 'central_admin' });
    const bad = await request(app).put('/api/detection/config').set(bearer(admin)).send({ thresholds: { hr: { normal: [105, 55] } } });
    expect(bad.status).toBe(400);
    await request(app).put('/api/detection/config').set(bearer(admin)).send({ thresholds: {} }); // reset
  });

  it('shows one patient\'s override next to the global value, and clears it', async () => {
    const admin = (await loginAs(await makeUser({ role: 'central_admin' }))).token;
    const p = await patientSession();
    await monitoring.engine.updateProfile?.(p.patient);
    const put = await request(app).put(`/api/detection/patients/${p.patient.patientId}/thresholds`).set(bearer(admin)).send({ thresholds: { spo2: { normal: [92, 100], critical: { below: 88 } } } });
    expect(put.status).toBe(200);
    const get = await request(app).get(`/api/detection/patients/${p.patient.patientId}/thresholds`).set(bearer(admin));
    expect(get.status).toBe(200);
    expect(get.body.override.spo2.normal).toEqual([92, 100]);
    expect(get.body.effective.spo2.critical.below).toBe(88);
    expect(get.body.globalThresholds.spo2.critical.below).toBe(90);
    await request(app).put(`/api/detection/patients/${p.patient.patientId}/thresholds`).set(bearer(admin)).send({ thresholds: {} });
    expect((await request(app).get(`/api/detection/patients/${p.patient.patientId}/thresholds`).set(bearer(admin))).body.override).toEqual({});
    expect((await request(app).get(`/api/detection/patients/${p.patient.patientId}/thresholds`).set(bearer(p.token))).status).toBe(403);
  });
});
