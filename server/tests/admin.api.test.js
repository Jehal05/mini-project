import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

// The MongoDB layer is an in-memory store. Routes, admin guard, validation and the backup service run for real.
vi.mock('../src/services/mongoStore.js', async () => {
  const f = await import('./helpers/fakeBackupStore.js');
  const store = f.createFakeStore(f.sampleData());
  globalThis.__backupStore = store;
  return { mongoStore: store, createCodec: () => f.jsonCodec, TMP_SUFFIX: '__restore_tmp' };
});
vi.mock('../src/services/auditRepo.js', () => ({ writeAdminAudit: vi.fn(async () => {}) }));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { sampleData } from './helpers/fakeBackupStore.js';

const admin = { 'x-admin-token': 'test-admin-token' };
let dir;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ht-api-backup-'));
  Object.assign(env, { backupDir: dir, backupKeep: 5, adminDevToken: 'test-admin-token', nodeEnv: 'test', backupEncryptionKey: '' });
});
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });
beforeEach(() => {
  const s = globalThis.__backupStore;
  s.live.clear();
  for (const [k, v] of Object.entries(sampleData())) s.live.set(k, v);
});

describe('feature 99: admin backup API', () => {
  it('is admin only', async () => {
    expect((await request(app).get('/api/admin/backups')).status).toBe(401);
    expect((await request(app).post('/api/admin/backups').set('x-admin-token', 'nope')).status).toBe(401);
    expect((await request(app).get('/api/admin/export/hospitals').set('x-hospital-id', '0'.repeat(24))).status).toBe(401); // hospital staff are not admins
  });

  it('backs up, lists and verifies', async () => {
    const made = await request(app).post('/api/admin/backups').set(admin);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ verified: true, totalDocuments: 6 });
    const list = await request(app).get('/api/admin/backups').set(admin);
    expect(list.body.results.map((b) => b.name)).toContain(made.body.name);
    const ver = await request(app).post(`/api/admin/backups/${made.body.name}/verify`).set(admin);
    expect(ver.body).toMatchObject({ ok: true });
  });

  it('restore is a dry run unless the phrase RESTORE is typed', async () => {
    const { body } = await request(app).post('/api/admin/backups').set(admin);
    globalThis.__backupStore.live.set('hospitals', []);
    const dry = await request(app).post(`/api/admin/backups/${body.name}/restore`).set(admin).send({});
    expect(dry.body).toMatchObject({ dryRun: true });
    expect(dry.body.plan.find((p) => p.collection === 'hospitals')).toMatchObject({ liveDocuments: 0, backupDocuments: 2 });
    expect(globalThis.__backupStore.live.get('hospitals')).toEqual([]);
    const wrong = await request(app).post(`/api/admin/backups/${body.name}/restore`).set(admin).send({ confirm: 'restore' });
    expect(wrong.body.dryRun).toBe(true);
    const real = await request(app).post(`/api/admin/backups/${body.name}/restore`).set(admin).send({ confirm: 'RESTORE' });
    expect(real.status).toBe(200);
    expect(real.body).toMatchObject({ restored: true });
    expect(globalThis.__backupStore.live.get('hospitals')).toHaveLength(2);
  });

  it('rejects bad names and unknown backups', async () => {
    expect((await request(app).post('/api/admin/backups/..%2F..%2Fetc%2Fpasswd/verify').set(admin)).status).toBe(400);
    expect((await request(app).post('/api/admin/backups/not-a-backup/restore').set(admin).send({ confirm: 'RESTORE' })).status).toBe(400);
    expect((await request(app).post('/api/admin/backups/healthtwin-20200101-000000.htbak/verify').set(admin)).status).toBe(404);
  });

  it('exports reference data as json and csv, but never patient data', async () => {
    const json = await request(app).get('/api/admin/export/hospitals').set(admin);
    expect(json.status).toBe(200);
    expect(json.headers['content-disposition']).toContain('hospitals.json');
    expect(JSON.parse(json.text)).toHaveLength(2);
    const csv = await request(app).get('/api/admin/export/doctors?format=csv').set(admin);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toContain('name');
    for (const c of ['patients', 'vitalreadings', 'emergencycases', 'users']) {
      expect((await request(app).get(`/api/admin/export/${c}`).set(admin)).status).toBe(403);
    }
  });
});
