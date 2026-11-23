import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/authRepo.js', async () => await import('./helpers/fakeAuthRepo.js'));
vi.mock('../src/services/caseRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/alternatives.js', async () => {
  const f = await import('./helpers/fakeDb.js');
  return { prepareCandidates: f.prepareCandidates, markNotified: f.markNotified, nextHospital: f.nextHospital };
});
vi.mock('../src/services/ambulanceRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/tripRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/push.js', () => ({ pushToHospital: vi.fn(async () => ({ sent: 0 })) }));

import app from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { addUser, resetAuth } from './helpers/fakeAuthRepo.js';
import { db, resetDb, seedCase, oid } from './helpers/fakeDb.js';

const PW = 'Correct#Horse9';
const [H1, H2] = [oid(1), oid(2)];
const [D1, D2] = [oid(901), oid(902)];
const csrf = { 'X-Requested-With': 'healthtwin' };
let hash;
beforeAll(async () => { hash = await hashPassword(PW); });
beforeEach(() => {
  resetAuth(); resetDb();
  db.doctors.set(D1, { _id: D1, name: 'Dr. A', hospital: H1, specialty: 'cardiologist', onDuty: true });
  db.doctors.set(D2, { _id: D2, name: 'Dr. B', hospital: H2, specialty: 'emergency', onDuty: true });
  addUser({ email: 'doc@x.test', passwordHash: hash, role: 'doctor', hospital: H1, doctor: D1 });
  addUser({ email: 'staff@x.test', passwordHash: hash, role: 'hospital_staff', hospital: H1 });
});

const login = (portal, email) => request(app).post(`/api/auth/login/${portal}`).send({ email, password: PW });

describe('login endpoints', () => {
  it('signs in, sets an httpOnly refresh cookie, never returns the hash', async () => {
    const res = await login('doctor', 'doc@x.test');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ role: 'doctor', doctorId: D1 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    expect(res.headers['set-cookie'][0]).toMatch(/ht_refresh=.*HttpOnly/);
  });
  it('gives one message for wrong password and wrong portal', async () => {
    const bad = await request(app).post('/api/auth/login/doctor').send({ email: 'doc@x.test', password: 'nope' });
    const portal = await login('staff', 'doc@x.test');
    expect(bad.status).toBe(401); expect(portal.status).toBe(401);
    expect(bad.body.error).toBe(portal.body.error);
  });
  it('refresh needs the CSRF header and the cookie, and rotates', async () => {
    const res = await login('doctor', 'doc@x.test');
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(403);
    const ok = await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', cookie);
    expect(ok.status).toBe(200);
    const replay = await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('SESSION_REUSED');
  });
  it('GET /me works with the token, and logout ends it', async () => {
    const res = await login('staff', 'staff@x.test');
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    expect((await request(app).get('/api/auth/me').set(auth)).body.user.role).toBe('hospital_staff');
    await request(app).post('/api/auth/logout').set(csrf).set('Cookie', res.headers['set-cookie'][0].split(';')[0]);
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
  });
});

describe('real sessions on the existing routes', () => {
  it('a doctor sees only their own cases, using only the token', async () => {
    const mine = seedCase({ status: 'accepted', hospital: H1, doctor: D1 });
    seedCase({ status: 'accepted', hospital: H2, doctor: D2 });
    const t = (await login('doctor', 'doc@x.test')).body.accessToken;
    const res = await request(app).get(`/api/doctors/${D1}/cases`).set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.results.map((c) => c.id)).toEqual([mine]);
    expect((await request(app).get(`/api/doctors/${D2}/cases`).set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });
  it('hospital routes use the hospital from the account, not from a header', async () => {
    const t = (await login('staff', 'staff@x.test')).body.accessToken;
    const auth = { Authorization: `Bearer ${t}`, 'x-hospital-id': H2 }; // the header is ignored
    expect((await request(app).get(`/api/hospitals/${H1}/cases`).set(auth)).status).toBe(200);
    expect((await request(app).get(`/api/hospitals/${H2}/cases`).set(auth)).status).toBe(403);
  });
  it('a staff token cannot use the admin or doctor routes', async () => {
    const t = (await login('staff', 'staff@x.test')).body.accessToken;
    expect((await request(app).get('/api/admin/backups').set('Authorization', `Bearer ${t}`)).status).toBe(403);
    expect((await request(app).get(`/api/doctors/${D1}/cases`).set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });
});
