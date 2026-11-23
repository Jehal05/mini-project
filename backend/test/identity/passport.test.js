import { describe, expect, it, vi } from 'vitest';
import { AuditLog, BystanderReport, Patient, Quota } from '../../src/models/index.js';
import { EVENTS, appEvents } from '../../src/events.js';
import { getEmergencySummary } from '../../src/services/patientSummary.js';
import { agent, bearer, JPEG, loginAs, makeHospital, makeUser, patientSession } from './helpers.js';

const me = (s, m, u, b) => s.agent[m](`/api/patients/me${u}`).set(s.auth).send(b);

async function richPatient() {
  const s = await patientSession();
  await me(s, 'patch', '/personal', { fullName: 'Secret Fullname', bloodGroup: 'O+', city: 'Pune', address: '12 Private Lane' });
  await me(s, 'post', '/allergies', { allergen: 'Penicillin', reaction: 'Anaphylaxis', severity: 'severe' });
  await me(s, 'post', '/allergies', { allergen: 'Dust', severity: 'mild' });
  await me(s, 'post', '/cardiacConditions', { type: 'stent', year: 2022 });
  await me(s, 'post', '/medicalConditions', { name: 'Diabetes' });
  await me(s, 'post', '/medications', { drug: 'Clopidogrel', dose: '75 mg' });
  await me(s, 'post', '/contacts', { name: 'Second', relation: 'Friend', phone: '+91 90000 00002', email: 's@example.com', priority: 2 });
  await me(s, 'post', '/contacts', { name: 'First', relation: 'Spouse', phone: '+91 90000 00001', email: 'f@example.com', priority: 1 });
  await s.agent.put('/api/patients/me/photo').set(s.auth).attach('photo', JPEG, 'p.jpg');
  const url = (await me(s, 'get', '/qr')).body.url;
  return { ...s, url, token: url.split('/p/')[1], authToken: s.token };
}

describe('public passport (emergency tier)', () => {
  it('needs no login and returns exactly the emergency fields', async () => {
    const s = await richPatient();
    const res = await agent().get(`/api/passport/${s.token}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.passport).sort()).toEqual(['bloodGroup', 'cardiacHistory', 'emergencyContact', 'hasPhoto', 'patientId', 'photoUrl', 'severeAllergies'].sort());
    expect(res.body.passport).toMatchObject({
      patientId: s.patient.patientId,
      bloodGroup: 'O+',
      severeAllergies: [{ allergen: 'Penicillin', reaction: 'Anaphylaxis' }],
      cardiacHistory: [{ type: 'stent', year: 2022 }],
      emergencyContact: { name: 'First', relation: 'Spouse', phone: '+919000000001' },
    });
    expect(Object.keys(res.body.passport.emergencyContact).sort()).toEqual(['name', 'phone', 'relation']);
  });

  it('leaks nothing outside the tier', async () => {
    const s = await richPatient();
    const text = JSON.stringify((await agent().get(`/api/passport/${s.token}`)).body);
    for (const secret of ['Secret Fullname', 'Pune', 'Private Lane', 'Diabetes', 'Clopidogrel', 'Dust', 'f@example.com', 'Second', s.email, 'qrToken']) expect(text).not.toContain(secret);
  });

  it('serves the photo through the token, and nothing else', async () => {
    const s = await richPatient();
    const res = await agent().get(`/api/passport/${s.token}/photo`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect((await agent().get(`/api/passport/${'0'.repeat(64)}/photo`)).status).toBe(404);
  });

  it('answers identically for malformed, unknown and revoked tokens', async () => {
    const s = await richPatient();
    await me(s, 'post', '/qr/regenerate', {});
    const bodies = [];
    for (const t of ['short', 'z'.repeat(64), 'a'.repeat(64), s.token, '%00', 'a'.repeat(500)]) {
      const res = await agent().get(`/api/passport/${t}`);
      expect(res.status, t).toBe(404);
      bodies.push(JSON.stringify(res.body));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).error.code).toBe('PASSPORT_NOT_FOUND');
    // the same for every public route
    const r = await agent().post(`/api/passport/${s.token}/report`).send({ latitude: 18.5, longitude: 73.8 });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('PASSPORT_NOT_FOUND');
  });

  it('regenerating kills the old token at once and the new one works', async () => {
    const s = await richPatient();
    const before = (await agent().get(`/api/passport/${s.token}`)).status;
    const regen = await me(s, 'post', '/qr/regenerate', {});
    const newToken = regen.body.url.split('/p/')[1];
    expect(before).toBe(200);
    expect(newToken).not.toBe(s.token);
    expect((await agent().get(`/api/passport/${s.token}`)).status).toBe(404);
    expect((await agent().get(`/api/passport/${newToken}`)).status).toBe(200);
    expect((await me(s, 'get', '/qr')).body.url).toBe(regen.body.url);
  });

  it('stays correct when regenerate calls race', async () => {
    const s = await richPatient();
    const urls = (await Promise.all(Array.from({ length: 5 }, () => me(s, 'post', '/qr/regenerate', {})))).map((r) => r.body.url);
    const current = (await Patient.findById(s.patient._id)).qrToken;
    expect(urls.some((u) => u.endsWith(current))).toBe(true);
    let live = 0;
    for (const u of urls) live += (await agent().get(`/api/passport/${u.split('/p/')[1]}`)).status === 200 ? 1 : 0;
    expect(live).toBe(1);
  });

  it('puts only a URL with the random token in the QR', async () => {
    const s = await richPatient();
    expect(s.url).toMatch(/^https?:\/\/[^/]+\/p\/[a-f0-9]{64}$/);
  });

  it('audits scans by patient ID, never storing the token', async () => {
    const s = await richPatient();
    await agent().get(`/api/passport/${s.token}`);
    const entry = await AuditLog.findOne({ action: 'passport.scan' });
    expect(entry.resourceId).toBe(s.patient.patientId);
    expect(JSON.stringify(entry.toJSON())).not.toContain(s.token);
    await me(s, 'post', '/qr/regenerate', {});
    const all = JSON.stringify((await AuditLog.find()).map((e) => e.toJSON()));
    expect(all).not.toContain(s.token);
  });

  it('rate-limits public routes per IP', async () => {
    process.env.RATE_LIMIT = 'on';
    vi.resetModules();
    const { createApp } = await import('../../src/app.js');
    const request = (await import('supertest')).default;
    const a = request(createApp());
    const codes = [];
    for (let i = 0; i < 70; i += 1) codes.push((await a.get(`/api/passport/${'b'.repeat(64)}`)).status);
    delete process.env.RATE_LIMIT;
    expect(codes.slice(0, 60).every((c) => c === 404)).toBe(true);
    expect(codes.slice(60).every((c) => c === 429)).toBe(true);
  });
});

describe('full record behind the QR', () => {
  const hospitalUser = async (role) => loginAs(await makeUser({ role, hospital: await makeHospital() }));

  it('needs a hospital login: anonymous, patients and admins are refused', async () => {
    const s = await richPatient();
    const url = `/api/passport/${s.token}/full`;
    expect((await agent().get(url)).status).toBe(401);
    expect((await agent().get(url).set(bearer(s.authToken))).status).toBe(403);
    const admin = await loginAs(await makeUser({ role: 'central_admin' }));
    expect((await agent().get(url).set(bearer(admin.token))).status).toBe(403);
  });

  it.each(['doctor', 'hospital_staff', 'hospital_admin'])('lets a %s read it, and audits the view without the token', async (role) => {
    const s = await richPatient();
    const h = await hospitalUser(role);
    const res = await agent().get(`/api/passport/${s.token}/full`).set(bearer(h.token));
    expect(res.status).toBe(200);
    expect(res.body.patient.medications[0].drug).toBe('Clopidogrel');
    expect(res.body.patient.medications[0].isBloodThinner).toBe(true);
    expect(res.body.patient.qrToken).toBeUndefined();
    const entry = await AuditLog.findOne({ action: 'record.view' });
    expect(entry).toBeTruthy();
    expect(entry.role).toBe(role);
    expect(entry.resourceId).toBe(s.patient.patientId);
    expect(JSON.stringify(entry.toJSON())).not.toContain(s.token);
  });

  it('does not show the record when the audit entry cannot be written', async () => {
    const s = await richPatient();
    const h = await hospitalUser('doctor');
    const spy = vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await agent().get(`/api/passport/${s.token}/full`).set(bearer(h.token));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('Clopidogrel');
  });

  it('returns the same 404 for a revoked token, even to a doctor', async () => {
    const s = await richPatient();
    const h = await hospitalUser('doctor');
    await me(s, 'post', '/qr/regenerate', {});
    const res = await agent().get(`/api/passport/${s.token}/full`).set(bearer(h.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PASSPORT_NOT_FOUND');
  });

  it('serves documents to hospital logins, audited', async () => {
    const s = await richPatient();
    const up = await s.agent.post('/api/patients/me/documents').set(s.auth).field('type', 'ecg').attach('file', Buffer.from('%PDF-1.4\n%%EOF'), 'e.pdf');
    const h = await hospitalUser('doctor');
    const url = `/api/passport/${s.token}/full/documents/${up.body.document._id}/file`;
    expect((await agent().get(url)).status).toBe(401);
    expect((await agent().get(url).set(bearer(h.token))).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'record.view', resourceType: 'document' })).toBe(1);
    expect((await agent().get(`/api/passport/${s.token}/full/documents/bad/file`).set(bearer(h.token))).status).toBe(404);
  });
});

describe('bystander report (feature 106)', () => {
  const report = (token, body = { latitude: 18.52, longitude: 73.85, accuracyMeters: 12 }, ip) => {
    const r = agent().post(`/api/passport/${token}/report`);
    if (ip) r.set('X-Forwarded-For', ip);
    return r.send(body);
  };

  it('records a pending report with the location and emits the documented event', async () => {
    const s = await richPatient();
    const seen = [];
    appEvents.once(EVENTS.BYSTANDER_REPORT, (e) => seen.push(e));
    const res = await report(s.token);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ received: true, reportId: expect.any(String) });
    const stored = await BystanderReport.findOne();
    expect(stored.status).toBe('pending');
    expect(String(stored.patient)).toBe(String(s.patient._id));
    expect(stored.location.latitude).toBe(18.52);
    expect(stored.reportedAt).toBeInstanceOf(Date);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ reportId: res.body.reportId, patientId: s.patient.patientId, location: { latitude: 18.52, longitude: 73.85, accuracyMeters: 12 } });
    expect(EVENTS.BYSTANDER_REPORT).toBe('emergency:bystander_report');
  });

  it('does not create an emergency case or reveal patient data in the reply', async () => {
    const s = await richPatient();
    const res = await report(s.token);
    expect(JSON.stringify(res.body)).not.toMatch(/O\+|Penicillin|First|HT-/);
    const { EmergencyCase } = await import('../../src/models/EmergencyCase.js');
    expect(await EmergencyCase.countDocuments()).toBe(0);
  });

  it('requires a valid location', async () => {
    const s = await richPatient();
    for (const bad of [{}, { latitude: 18 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: 'x', longitude: 1 }]) {
      expect((await report(s.token, bad)).status).toBe(400);
    }
    expect(await BystanderReport.countDocuments()).toBe(0);
  });

  it('limits reports per IP (exact under parallel requests) and per patient', async () => {
    process.env.RATE_LIMIT = 'off';
    const a = await richPatient();
    const results = await Promise.all(Array.from({ length: 12 }, () => report(a.token)));
    // the per-patient limit (3) is tighter than per-IP (5), so exactly 3 go through
    expect(results.filter((r) => r.status === 202)).toHaveLength(3);
    expect(results.filter((r) => r.status === 429)).toHaveLength(9);
    expect(await BystanderReport.countDocuments()).toBe(3);
  });

  it('applies the per-IP limit across different patients', async () => {
    const people = [];
    for (let i = 0; i < 6; i += 1) people.push(await richPatient());
    const codes = [];
    for (const p of people) codes.push((await report(p.token)).status);
    expect(codes.filter((c) => c === 202)).toHaveLength(5);
    expect(codes.at(-1)).toBe(429);
    expect((await Quota.countDocuments())).toBeGreaterThan(0);
  });

  it('does not count malformed tokens against anyone', async () => {
    await report('nope');
    expect(await Quota.countDocuments()).toBe(0);
  });
});

describe('getEmergencySummary', () => {
  it('accepts a patient id, an object id or a document and returns null for unknown', async () => {
    const s = await richPatient();
    const a = await getEmergencySummary(s.patient.patientId);
    const b = await getEmergencySummary(s.patient._id);
    const c = await getEmergencySummary(await Patient.findById(s.patient._id));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.severeAllergies).toHaveLength(1);
    expect(await getEmergencySummary('HT-2099-9999')).toBeNull();
  });

  it('picks the lowest priority contact and handles an empty record', async () => {
    const s = await patientSession();
    const empty = await getEmergencySummary(s.patient);
    expect(empty).toMatchObject({ bloodGroup: null, severeAllergies: [], cardiacHistory: [], emergencyContact: null });
  });
});
