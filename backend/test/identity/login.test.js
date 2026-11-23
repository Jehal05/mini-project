import { describe, expect, it } from 'vitest';
import { AuditLog, LoginAttempt } from '../../src/models/index.js';
import { PASSWORD, agent, bearer, loginAs, makeHospital, makeUser } from './helpers.js';

describe('features 2-5: logins', () => {
  it.each(['patient', 'doctor', 'hospital_staff', 'hospital_admin', 'central_admin'])('%s can log in through their own portal', async (role) => {
    const hospital = ['doctor', 'hospital_staff', 'hospital_admin'].includes(role) ? await makeHospital() : undefined;
    const user = await makeUser({ role, hospital });
    const { res } = await loginAs(user);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i);

    const me = await agent().get('/api/auth/me').set(bearer(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(String(user._id));
    expect(me.body.user.hospitalId).toBe(hospital ? String(hospital._id) : undefined);
  });

  it('puts hospitalId in the token for hospital roles (feature 5)', async () => {
    const hospital = await makeHospital();
    const staff = await makeUser({ role: 'hospital_staff', hospital });
    const { token } = await loginAs(staff);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.hospitalId).toBe(String(hospital._id));
    expect(payload.role).toBe('hospital_staff');
  });

  it('signs access tokens that last 15 minutes', async () => {
    const { token } = await loginAs(await makeUser());
    const { iat, exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(exp - iat).toBe(15 * 60);
  });

  it('refuses the right password on the wrong portal with the same generic message', async () => {
    const hospital = await makeHospital();
    const doctor = await makeUser({ role: 'doctor', hospital });
    const wrongPortal = await agent().post('/api/auth/login/admin').send({ identifier: doctor.email, password: PASSWORD });
    const wrongPassword = await agent().post('/api/auth/login/doctor').send({ identifier: doctor.email, password: 'Nope12345' });
    const unknown = await agent().post('/api/auth/login/doctor').send({ identifier: 'nobody@test.example', password: PASSWORD });
    for (const res of [wrongPortal, wrongPassword, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe(wrongPortal.body.error.message);
    }
    expect(wrongPortal.headers['set-cookie']).toBeUndefined();
  });

  it('logs in by phone number too', async () => {
    const user = await makeUser({ email: undefined, phone: '+919800000001' });
    const res = await agent().post('/api/auth/login/patient').send({ identifier: '98000 00001', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(String(user._id));
  });

  it('locks the account after 5 wrong passwords, even for the right one, then lets it back in when the lock ends', async () => {
    const user = await makeUser();
    for (let i = 0; i < 5; i += 1) {
      const r = await agent().post('/api/auth/login/patient').send({ identifier: user.email, password: 'Wrong12345' });
      expect(r.status).toBe(401);
    }
    const locked = await agent().post('/api/auth/login/patient').send({ identifier: user.email, password: PASSWORD });
    expect(locked.status).toBe(429);

    await LoginAttempt.updateMany({}, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    const ok = await agent().post('/api/auth/login/patient').send({ identifier: user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('rejects disabled accounts', async () => {
    const user = await makeUser({ isActive: false });
    const { res } = await loginAs(user);
    expect(res.status).toBe(401);
  });

  it('writes audit entries for successful and failed logins (feature 98)', async () => {
    const user = await makeUser();
    await loginAs(user);
    await agent().post('/api/auth/login/patient').send({ identifier: user.email, password: 'Wrong12345' });
    const logs = await AuditLog.find({ action: 'auth.login' }).sort({ createdAt: 1 }).lean();
    expect(logs.map((l) => l.outcome)).toEqual(['success', 'failure']);
    expect(logs[0]).toMatchObject({ role: 'patient', actorLabel: user.email });
    expect(JSON.stringify(logs)).not.toContain(PASSWORD);
  });

  it('validates the body', async () => {
    const res = await agent().post('/api/auth/login/patient').send({ identifier: '' });
    expect(res.status).toBe(400);
  });
});
