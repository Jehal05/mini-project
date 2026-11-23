import { describe, expect, it } from 'vitest';
import { AuditLog, Patient, User } from '../../src/models/index.js';
import { agent, validRegistration } from './helpers.js';

describe('feature 1: patient registration', () => {
  it('creates the account, patient record, ID and QR token together and signs the patient in', async () => {
    const ag = agent();
    const res = await ag.post('/api/auth/register').send(validRegistration());
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ role: 'patient', name: 'Rahul Test' });
    expect(res.body.user.patient.patientId).toMatch(/^HT-\d{4}-0001$/);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const user = await User.findOne({ email: 'rahul.test@example.com' }).select('+passwordHash');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt, never plain text
    const patient = await Patient.findOne({ user: user._id });
    expect(patient.qrToken).toHaveLength(64);
    expect(patient.consent).toMatchObject({ dataUse: true, location: true });
    expect(await AuditLog.countDocuments({ action: 'patient.register' })).toBe(1);

    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('accepts a phone number instead of an email and normalises it', async () => {
    const res = await agent().post('/api/auth/register').send(validRegistration({ email: undefined, phone: '98765 43210' }));
    expect(res.status).toBe(201);
    expect((await User.findOne({ phone: '+919876543210' })).role).toBe('patient');
  });

  it('requires consent to data use', async () => {
    const res = await agent().post('/api/auth/register').send(validRegistration({ consent: { dataUse: false, location: true } }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details['consent.dataUse']).toBeTruthy();
    expect(await User.countDocuments()).toBe(0);
  });

  it.each([
    ['too short', 'Ab1'],
    ['no number', 'abcdefghij'],
    ['no letter', '1234567890'],
  ])('rejects a weak password (%s)', async (_label, password) => {
    const res = await agent().post('/api/auth/register').send(validRegistration({ password }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.password).toBeTruthy();
  });

  it('needs an email or a phone', async () => {
    const res = await agent().post('/api/auth/register').send(validRegistration({ email: undefined }));
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email or phone', async () => {
    await agent().post('/api/auth/register').send(validRegistration({ phone: '9876543210' })).expect(201);
    const sameEmail = await agent().post('/api/auth/register').send(validRegistration({ phone: undefined }));
    expect(sameEmail.status).toBe(409);
    const samePhone = await agent().post('/api/auth/register').send(validRegistration({ email: 'other@example.com', phone: '+91 98765 43210' }));
    expect(samePhone.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  it('gives two simultaneous sign-ups different patient IDs', async () => {
    const [a, b] = await Promise.all([
      agent().post('/api/auth/register').send(validRegistration({ email: 'a@example.com' })),
      agent().post('/api/auth/register').send(validRegistration({ email: 'b@example.com' })),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.user.patient.patientId).not.toBe(b.body.user.patient.patientId);
  });

  it('cannot be used to create a non-patient account', async () => {
    const res = await agent().post('/api/auth/register').send({ ...validRegistration(), role: 'central_admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('patient');
  });
});
