import { describe, expect, it, beforeEach } from 'vitest';
import { PasswordReset, RefreshToken } from '../../src/models/index.js';
import { outbox } from '../../src/utils/mailer.js';
import { PASSWORD, agent, loginAs, makeUser, settleBackground } from './helpers.js';

import { lastMailToken } from './helpers.js';
const tokenFromMail = lastMailToken; // waits for the background send
const NEW_PASSWORD = 'Brandnew99';

beforeEach(() => { outbox.length = 0; });

describe('feature 7: forgot password', () => {
  it('emails a reset link and answers the same whether or not the account exists', async () => {
    const user = await makeUser();
    const known = await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const unknown = await agent().post('/api/auth/forgot-password').send({ email: 'ghost@test.example' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    await settleBackground();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(user.email);
    expect(outbox[0].text).toMatch(/reset-password\?token=[a-f0-9]{64}/);
    expect(outbox[0].text).toMatch(/15 minutes/);
  });

  it('stores only a hash of the token and expires it in 15 minutes', async () => {
    const user = await makeUser();
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const raw = await tokenFromMail();
    const doc = await PasswordReset.findOne();
    expect(doc.tokenHash).not.toBe(raw);
    expect(doc.tokenHash).toHaveLength(64);
    const ttl = doc.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('resets the password, signs out every device, and the old password stops working', async () => {
    const user = await makeUser();
    const { agent: device } = await loginAs(user);
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const res = await agent().post('/api/auth/reset-password').send({ token: await tokenFromMail(), password: NEW_PASSWORD });
    expect(res.status).toBe(200);

    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
    expect((await device.post('/api/auth/refresh').set({ 'X-Requested-With': 'healthtwin' })).status).toBe(401);
    expect((await loginAs(user, PASSWORD)).res.status).toBe(401);
    expect((await loginAs(user, NEW_PASSWORD)).res.status).toBe(200);
  });

  it('works only once', async () => {
    const user = await makeUser();
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const token = await tokenFromMail();
    expect((await agent().post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })).status).toBe(200);
    const again = await agent().post('/api/auth/reset-password').send({ token, password: 'Another1234' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('only one of two simultaneous uses succeeds', async () => {
    const user = await makeUser();
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const token = await tokenFromMail();
    const results = await Promise.all([NEW_PASSWORD, 'Another1234'].map((password) => agent().post('/api/auth/reset-password').send({ token, password })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('refuses an expired link', async () => {
    const user = await makeUser();
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const token = await tokenFromMail();
    await PasswordReset.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await agent().post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect((await loginAs(user, NEW_PASSWORD)).res.status).toBe(401);
  });

  it('only the newest link works when a second one is requested', async () => {
    const user = await makeUser();
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const first = await tokenFromMail();
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    const second = await tokenFromMail();
    expect((await agent().post('/api/auth/reset-password').send({ token: first, password: NEW_PASSWORD })).status).toBe(400);
    expect((await agent().post('/api/auth/reset-password').send({ token: second, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('applies the password rules and rejects garbage tokens', async () => {
    const weak = await agent().post('/api/auth/reset-password').send({ token: 'a'.repeat(64), password: 'short' });
    expect(weak.status).toBe(400);
    const bogus = await agent().post('/api/auth/reset-password').send({ token: 'a'.repeat(64), password: NEW_PASSWORD });
    expect(bogus.status).toBe(400);
    expect(bogus.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('clears an account lock when the password is reset', async () => {
    const user = await makeUser();
    for (let i = 0; i < 5; i += 1) await agent().post('/api/auth/login/patient').send({ identifier: user.email, password: 'Wrong12345' });
    await agent().post('/api/auth/forgot-password').send({ email: user.email });
    await agent().post('/api/auth/reset-password').send({ token: await tokenFromMail(), password: NEW_PASSWORD }).expect(200);
    expect((await loginAs(user, NEW_PASSWORD)).res.status).toBe(200);
  });
});
