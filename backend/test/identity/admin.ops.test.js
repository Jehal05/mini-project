// Prioritised queue (95), analytics (96), backup and restore (99).
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLog, EmergencyCase, Hospital, Patient } from '../../src/models/index.js';
import { app, bearer, loginAs, makeHospital, makeUser, patientSession } from './helpers.js';

const admin = async () => (await loginAs(await makeUser({ role: 'central_admin' }))).token;
const caseFor = (p, over = {}) => EmergencyCase.create({ patient: p.patient._id, patientCode: p.patient.patientId, source: 'manual_sos', severity: 3, status: 'searching', ...over });

describe('prioritised emergency queue (95)', () => {
  it('sorts live cases by severity, then risk, and hides closed ones', async () => {
    const a = await patientSession(); const b = await patientSession(); const c = await patientSession();
    await caseFor(a, { severity: 2, detection: { riskScore: 95 } });
    await caseFor(b, { severity: 3, detection: { riskScore: 30 } });
    await caseFor(c, { severity: 3, status: 'cancelled', cancellation: { reason: 'other' } });
    const t = await admin();
    const res = await request(app).get('/api/admin/emergencies').set(bearer(t));
    expect(res.status).toBe(200);
    const mine = res.body.items.filter((i) => [a, b, c].some((p) => p.patient.patientId === i.patientCode));
    expect(mine.map((i) => i.patientCode)).toEqual([b.patient.patientId, a.patient.patientId]);
    expect((await request(app).get('/api/admin/emergencies').set(bearer((await patientSession()).token))).status).toBe(403);
  });
});

describe('analytics (96)', () => {
  it('counts cases per day, stage medians against the targets, acceptance per hospital and the false-alarm rate', async () => {
    const h = await Hospital.create({ name: `Analytics Hospital ${Date.now()}`, location: { type: 'Point', coordinates: [73.85, 18.52] } });
    const p = await patientSession();
    const t0 = new Date();
    const tl = (type, min, data) => ({ type, at: new Date(t0.getTime() + min * 60_000), data });
    await caseFor(p, { status: 'arrived', acceptedHospital: h._id, acceptedAt: new Date(t0.getTime() + 2 * 60_000), hospitalResponses: [{ hospital: h._id, round: 1, status: 'accepted' }], timeline: [tl('sent', 0), tl('ambulance_assigned', 3), tl('preparation', 12, { item: 'cathLabTeamAlerted', value: true }), tl('trip_stage', 10, { stage: 'at_patient' }), tl('trip_stage', 24, { stage: 'patient_on_board' }), tl('arrived', 40)] });
    const q = await patientSession();
    await caseFor(q, { status: 'cancelled', cancellation: { reason: 'false_alarm' }, hospitalResponses: [{ hospital: h._id, round: 1, status: 'rejected' }] });
    const res = await request(app).get('/api/admin/analytics?days=7').set(bearer(await admin()));
    expect(res.status).toBe(200);
    expect(res.body.perDay).toHaveLength(7);
    expect(res.body.perDay.at(-1).count).toBeGreaterThanOrEqual(2);
    expect(res.body.stages.alertToAccept.samples).toBeGreaterThanOrEqual(1);
    expect(res.body.stages.sceneTime).toMatchObject({ targetMs: 600000 });
    expect(res.body.stages.sceneTime.overTarget).toBeGreaterThanOrEqual(1); // 14 min on scene against 10
    const mine = res.body.acceptance.find((r) => r.hospital === h.name);
    expect(mine).toMatchObject({ notified: 2, accepted: 1, rejected: 1, rate: 50 });
    expect(res.body.falseAlarm.count).toBeGreaterThanOrEqual(1);
  });
});

describe('backup and restore (99)', () => {
  it('exports without secrets, checks a file before restoring, and restores only on confirmation', async () => {
    const t = await admin();
    const h = await makeHospital(`Backup Hospital ${Date.now()}`);
    const p = await patientSession();
    const exp = await request(app).get('/api/admin/backup').set(bearer(t));
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toMatch(/healthtwin-backup-/);
    const file = exp.body;
    expect(file).toMatchObject({ format: 'healthtwin-backup', version: 1 });
    expect(file.data.hospitals.some((x) => x.name === h.name)).toBe(true);
    expect(JSON.stringify(file)).not.toMatch(/passwordHash|qrToken/);
    expect(file.data.users).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'backup.export' })).toBeGreaterThanOrEqual(1);

    // a damaged file is refused and nothing changes
    const bad = JSON.parse(JSON.stringify(file));
    bad.data.hospitals[0].name = undefined;
    delete bad.data.hospitals[0].name;
    const check = await request(app).post('/api/admin/backup/check').set(bearer(t)).send({ file: bad });
    expect(check.body.ok).toBe(false);
    expect(check.body.problems.join(' ')).toMatch(/hospitals\[0\]/);
    const refused = await request(app).post('/api/admin/backup/restore').set(bearer(t)).send({ file: bad, confirm: 'RESTORE' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('BACKUP_INVALID');
    expect(await Hospital.countDocuments({ name: h.name })).toBe(1);
    expect((await request(app).post('/api/admin/backup/check').set(bearer(t)).send({ file: { format: 'other' } })).body.ok).toBe(false);

    // restore needs the confirmation word, then puts back what was deleted
    expect((await request(app).post('/api/admin/backup/restore').set(bearer(t)).send({ file })).status).toBe(400);
    await Hospital.deleteMany({ name: h.name });
    await Patient.updateOne({ _id: p.patient._id }, { $set: { city: 'Changed City' } });
    const ok = await request(app).post('/api/admin/backup/restore').set(bearer(t)).send({ file, confirm: 'RESTORE' });
    expect(ok.status).toBe(200);
    expect(ok.body.restored.hospitals).toBe(file.data.hospitals.length);
    expect(await Hospital.countDocuments({ name: h.name })).toBe(1);
    expect((await Patient.findById(p.patient._id)).city).not.toBe('Changed City');
    expect(await AuditLog.countDocuments({ action: 'backup.restore' })).toBe(1);
    // sign-in still works: users are never touched
    expect((await loginAs(await makeUser({ role: 'central_admin' }))).token).toBeTruthy();
  });
  it('is for central admins only', async () => {
    const s = await patientSession();
    for (const [m, u] of [['get', '/api/admin/backup'], ['post', '/api/admin/backup/restore']]) expect((await request(app)[m](u).set(bearer(s.token)).send({})).status).toBe(403);
  });
});
