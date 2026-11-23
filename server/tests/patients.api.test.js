import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/authRepo.js', async () => await import('./helpers/fakeAuthRepo.js'));
vi.mock('../src/patients/patientRepo.js', async () => await import('./helpers/fakePatientRepo.js'));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { resetAuth } from './helpers/fakeAuthRepo.js';
import { resetPatients } from './helpers/fakePatientRepo.js';
import { resetQuotas } from '../src/utils/quota.js';

env.uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-api-'));
const PW = 'Correct#Horse9';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
beforeEach(() => { resetAuth(); resetPatients(); resetQuotas(); });

async function newPatient(email = 'p@x.test') {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Rahul Sharma', email, password: PW, consentDataUse: true });
  expect(reg.status).toBe(201);
  const login = await request(app).post('/api/auth/login/patient').send({ email, password: PW });
  return { token: login.body.accessToken, auth: { Authorization: `Bearer ${login.body.accessToken}` } };
}

describe('patient record API', () => {
  it('needs a patient sign-in', async () => {
    expect((await request(app).get('/api/patients/me')).status).toBe(401);
  });

  it('registers, signs in and reads the own record without the QR token', async () => {
    const { auth } = await newPatient();
    const res = await request(app).get('/api/patients/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.patient.patientId).toMatch(/^HT-\d{4}-0001$/);
    expect(JSON.stringify(res.body).includes('qrToken')).toBe(false);
  });

  it('answers field errors for bad input and rejects a field it does not own', async () => {
    const { auth } = await newPatient();
    const bad = await request(app).patch('/api/patients/me/personal').set(auth).send({ bloodGroup: 'Z+', qrToken: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.bloodGroup).toBeTruthy();
    expect(bad.body.fields.qrToken).toBeTruthy();
  });

  it('adds an allergy, uploads a PDF as base64 and serves it back with safe headers', async () => {
    const { auth } = await newPatient();
    const a = await request(app).post('/api/patients/me/allergies').set(auth).send({ allergen: 'Penicillin', severity: 'severe' });
    expect(a.status).toBe(201);
    const up = await request(app).post('/api/patients/me/documents').set(auth).send({ type: 'ecg', name: 'ecg.pdf', data: PDF.toString('base64') });
    expect(up.status).toBe(201);
    const file = await request(app).get(`/api/patients/me/documents/${up.body.document.id}/file`).set(auth);
    expect(file.status).toBe(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toMatch(/no-store/);
  });

  it('keeps the public passport to the emergency tier and the full record to hospital logins', async () => {
    const { auth } = await newPatient();
    await request(app).patch('/api/patients/me/personal').set(auth).send({ bloodGroup: 'O+', address: 'Secret street' });
    const qr = await request(app).get('/api/patients/me/qr').set(auth);
    const token = qr.body.url.split('/p/')[1];
    const pub = await request(app).get(`/api/passport/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.passport.bloodGroup).toBe('O+');
    expect(JSON.stringify(pub.body).includes('Secret street')).toBe(false);
    expect((await request(app).get(`/api/passport/${token}/full`)).status).toBe(401);
    expect((await request(app).get(`/api/passport/${token}/full`).set(auth)).status).toBe(403); // a patient is not a hospital login
    expect((await request(app).get('/api/passport/nope')).status).toBe(404);
  });

  it('takes a bystander report from anyone with the link', async () => {
    const { auth } = await newPatient();
    const token = (await request(app).get('/api/patients/me/qr').set(auth)).body.url.split('/p/')[1];
    const r = await request(app).post(`/api/passport/${token}/report`).send({ latitude: 18.52, longitude: 73.85 });
    expect(r.status).toBe(202);
    expect((await request(app).post(`/api/passport/${token}/report`).send({ latitude: 200, longitude: 1 })).status).toBe(400);
  });
});
