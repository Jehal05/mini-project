import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { forgotPassword } from '../../src/controllers/auth.controller.js';
import { authenticate, hospitalScope } from '../../src/middleware/index.js';
import { AuditLog, LoginAttempt, PasswordReset, RefreshToken, User } from '../../src/models/index.js';
import { drainBackground } from '../../src/utils/background.js';
import { outbox } from '../../src/utils/mailer.js';
import { CSRF, PASSWORD, agent, bearer, lastMailToken, loginAs, makeHospital, makeUser, validRegistration } from './helpers.js';
import { assertSafeTestDb } from './dbGuard.js';

const post = (path, body) => agent().post(path).send(body);
const wrong = (identifier) => post('/api/auth/login/patient', { identifier, password: 'Wrong12345' });
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('ht_refresh')).split(';')[0];
const clearsCookie = (res) => (res.headers['set-cookie'] ?? []).some((c) => /^ht_refresh=;/.test(c));

describe('lockout cannot be dodged (review item 1)', () => {
  it('lets only 5 of 30 simultaneous wrong guesses be evaluated, then locks', async () => {
    const user = await makeUser();
    const results = await Promise.all(Array.from({ length: 30 }, () => wrong(user.email)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(25);
    expect((await post('/api/auth/login/patient', { identifier: user.email, password: PASSWORD })).status).toBe(429);
  });

  it('starts counting again after a successful login', async () => {
    const user = await makeUser();
    for (let i = 0; i < 4; i += 1) expect((await wrong(user.email)).status).toBe(401);
    expect((await loginAs(user)).res.status).toBe(200);
    for (let i = 0; i < 5; i += 1) expect((await wrong(user.email)).status).toBe(401);
    expect(await LoginAttempt.countDocuments({ lockedUntil: { $exists: true } })).toBe(0);
  });

  it('shares one counter between an account\'s email and phone', async () => {
    const user = await makeUser({ phone: '+919800000077' });
    for (let i = 0; i < 3; i += 1) await wrong(user.email);
    for (let i = 0; i < 2; i += 1) await wrong('9800000077');
    expect((await wrong('9800000077')).status).toBe(429);
    expect((await wrong(user.email)).status).toBe(429);
  });

  it('unlocks when the lock time passes, with a fresh allowance', async () => {
    const user = await makeUser();
    for (let i = 0; i < 6; i += 1) await wrong(user.email);
    await LoginAttempt.updateMany({}, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await wrong(user.email)).status).toBe(401);
    expect((await loginAs(user)).res.status).toBe(200);
  });
});

describe('the lock does not reveal which accounts exist (review item 2)', () => {
  it('treats a real and a made-up account identically through the lock', async () => {
    const user = await makeUser();
    const seen = { real: [], ghost: [] };
    for (let i = 0; i < 8; i += 1) {
      const real = await wrong(user.email);
      const ghost = await wrong('nobody@test.example');
      seen.real.push([real.status, real.body.error.code]);
      seen.ghost.push([ghost.status, ghost.body.error.code]);
    }
    expect(seen.ghost).toEqual(seen.real);
    expect(seen.real.slice(-1)[0][0]).toBe(429);
  });
});

describe('audit log never stores a mistyped password (review item 3)', () => {
  it('replaces anything that is not an email or phone', async () => {
    await wrong('MyS3cretPassw0rd');
    await wrong('has spaces and 1234');
    const labels = (await AuditLog.find({ action: 'auth.login' })).map((l) => l.actorLabel);
    expect(labels).toEqual(['[unrecognised identifier]', '[unrecognised identifier]']);
  });

  it('still records emails (lower-cased) and phones (normalised) for real attempts', async () => {
    await wrong('Someone@Example.COM');
    await wrong('98765 43210');
    const labels = (await AuditLog.find({ action: 'auth.login' }).sort({ createdAt: 1 })).map((l) => l.actorLabel);
    expect(labels).toEqual(['someone@example.com', '+919876543210']);
  });
});

describe('ending a session ends its access tokens (review item 4)', () => {
  const me = (token) => agent().get('/api/auth/me').set(bearer(token));

  it('logout', async () => {
    const { agent: ag, token } = await loginAs(await makeUser());
    expect((await me(token)).status).toBe(200);
    await ag.post('/api/auth/logout').set(CSRF).expect(200);
    const res = await me(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
  });

  it('logout-all, including the other device', async () => {
    const user = await makeUser();
    const a = await loginAs(user);
    const b = await loginAs(user);
    await a.agent.post('/api/auth/logout-all').set(bearer(a.token)).expect(200);
    expect((await me(a.token)).status).toBe(401);
    expect((await me(b.token)).status).toBe(401);
  });

  it('password reset', async () => {
    const user = await makeUser();
    const { token } = await loginAs(user);
    await post('/api/auth/forgot-password', { email: user.email });
    await post('/api/auth/reset-password', { token: await lastMailToken(), password: 'Brandnew99' }).expect(200);
    expect((await me(token)).body.error.code).toBe('SESSION_REVOKED');
  });

  it('a disabled account stops working at once', async () => {
    const user = await makeUser();
    const { token } = await loginAs(user);
    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });
    expect((await me(token)).body.error.code).toBe('SESSION_REVOKED');
  });

  it('a refresh does NOT break the access token that is still in flight', async () => {
    const { agent: ag, token } = await loginAs(await makeUser());
    await ag.post('/api/auth/refresh').set(CSRF).expect(200);
    expect((await me(token)).status).toBe(200);
  });

  it('rejects a token for a login that never existed', async () => {
    const { token } = await loginAs(await makeUser());
    await RefreshToken.deleteMany({});
    expect((await me(token)).body.error.code).toBe('SESSION_REVOKED');
  });
});

describe('two tabs refreshing together (review item 5)', () => {
  it('keeps the cookie and the login for the loser of the race', async () => {
    const { agent: ag, res: login } = await loginAs(await makeUser());
    const old = cookieOf(login);
    const [a, b] = await Promise.all([1, 2].map(() => agent().post('/api/auth/refresh').set(CSRF).set('Cookie', old)));
    const [winner, loser] = a.status === 200 ? [a, b] : [b, a];
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(401);
    expect(loser.body.error.code).toBe('REFRESH_RACE');
    expect(clearsCookie(loser)).toBe(false);
    // the winner's cookie still works, so the user stays signed in
    const next = await agent().post('/api/auth/refresh').set(CSRF).set('Cookie', cookieOf(winner));
    expect(next.status).toBe(200);
    expect(ag).toBeTruthy();
  });

  it('a replay just after rotation is a race, not theft', async () => {
    const { agent: ag, res: login } = await loginAs(await makeUser());
    const old = cookieOf(login);
    await ag.post('/api/auth/refresh').set(CSRF).expect(200);
    const replay = await agent().post('/api/auth/refresh').set(CSRF).set('Cookie', old);
    expect(replay.body.error.code).toBe('REFRESH_RACE');
    expect(clearsCookie(replay)).toBe(false);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(1); // login still alive
    expect((await ag.post('/api/auth/refresh').set(CSRF)).status).toBe(200);
  });

  it('a logged-out token is plainly revoked and its cookie is cleared', async () => {
    const { agent: ag, res: login } = await loginAs(await makeUser());
    const old = cookieOf(login);
    await ag.post('/api/auth/logout').set(CSRF);
    const replay = await agent().post('/api/auth/refresh').set(CSRF).set('Cookie', old);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
    expect(clearsCookie(replay)).toBe(true);
  });
});

describe('hospitalScope checks every place a hospital id can come from (review item 6)', () => {
  const demo = () => {
    const a = express();
    a.use(express.json());
    a.post('/h/:hospitalId/x', authenticate, hospitalScope(), (req, res) => res.json({ scoped: req.hospitalId }));
    a.post('/x', authenticate, hospitalScope(), (req, res) => res.json({ scoped: req.hospitalId }));
    a.post('/only-params/:hospitalId', authenticate, hospitalScope((req) => req.params.hospitalId), (req, res) => res.json({ scoped: req.hospitalId }));
    return a;
  };
  const staff = async () => {
    const [h1, h2] = [await makeHospital('H1'), await makeHospital('H2')];
    return { h1, h2, token: (await loginAs(await makeUser({ role: 'hospital_staff', hospital: h1 }))).token };
  };

  it('blocks a different hospital in the body even when the route names the right one', async () => {
    const { h1, h2, token } = await staff();
    const res = await request(demo()).post(`/h/${h1._id}/x`).set(bearer(token)).send({ hospitalId: String(h2._id) });
    expect(res.status).toBe(403);
  });

  it('blocks a different hospital in the query, in a list, and as an operator object', async () => {
    const { h1, h2, token } = await staff();
    const call = (url, body) => request(demo()).post(url).set(bearer(token)).send(body);
    expect((await call(`/x?hospitalId=${h2._id}`, {})).status).toBe(403);
    expect((await call(`/x?hospitalId=${h1._id}&hospitalId=${h2._id}`, {})).status).toBe(403);
    expect((await call('/x', { hospitalId: { $ne: null } })).status).toBe(403);
    expect((await call('/x', { hospitalId: [String(h2._id)] })).status).toBe(403);
  });

  it('allows the own hospital everywhere it appears, and none at all', async () => {
    const { h1, token } = await staff();
    const own = await request(demo()).post(`/h/${h1._id}/x?hospitalId=${h1._id}`).set(bearer(token)).send({ hospitalId: String(h1._id) });
    expect(own.status).toBe(200);
    expect((await request(demo()).post('/x').set(bearer(token)).send({})).body.scoped).toBe(String(h1._id));
  });

  it('central admin: any hospital is fine, but conflicting or malformed ids are 400', async () => {
    const [h1, h2] = [await makeHospital('A'), await makeHospital('B')];
    const { token } = await loginAs(await makeUser({ role: 'central_admin' }));
    const call = (url, body = {}) => request(demo()).post(url).set(bearer(token)).send(body);
    expect((await call(`/h/${h1._id}/x`)).body.scoped).toBe(String(h1._id));
    expect((await call(`/h/${h1._id}/x`, { hospitalId: String(h2._id) })).status).toBe(400);
    expect((await call('/x?hospitalId=not-an-id')).status).toBe(400);
    expect((await call('/x')).body.scoped).toBeNull();
  });

  it('a custom getter checks only the place it names', async () => {
    const { h1, h2, token } = await staff();
    const ok = await request(demo()).post(`/only-params/${h1._id}`).set(bearer(token)).send({ hospitalId: String(h2._id) });
    expect(ok.status).toBe(200);
    expect((await request(demo()).post(`/only-params/${h2._id}`).set(bearer(token)).send({})).status).toBe(403);
  });
});

describe('forgot-password replies before doing any work (review item 7)', () => {
  it('has sent nothing yet when the reply goes out, for known and unknown emails alike', async () => {
    const user = await makeUser();
    const mailAfterWork = [];
    for (const email of [user.email, 'ghost@test.example']) {
      const sent = [];
      outbox.length = 0;
      const before = await PasswordReset.countDocuments();
      await forgotPassword({ valid: { email } }, { json: (body) => sent.push(body) });
      expect(sent).toHaveLength(1);
      expect(outbox).toHaveLength(0);
      expect(await PasswordReset.countDocuments()).toBe(before);
      await drainBackground();
      mailAfterWork.push(outbox.length);
    }
    expect(mailAfterWork).toEqual([1, 0]); // the real account gets its email afterwards, the unknown one nothing
  });
});

describe('passwords (review item 8)', () => {
  it('accepts letters from any language, e.g. Marathi', async () => {
    const password = 'पासवर्ड१२३४५'; // letters + digits, not ASCII
    const reg = await post('/api/auth/register', validRegistration({ password }));
    expect(reg.status).toBe(201);
    const login = await post('/api/auth/login/patient', { identifier: 'rahul.test@example.com', password });
    expect(login.status).toBe(200);
  });

  it('measures bcrypt\'s limit in bytes: 72 is fine, 73 is refused with a clear message', async () => {
    const ok = await post('/api/auth/register', validRegistration({ password: `${'a'.repeat(71)}1` }));
    expect(ok.status).toBe(201);
    const ascii = await post('/api/auth/register', validRegistration({ email: 'two@example.com', password: `${'a'.repeat(72)}1` }));
    expect(ascii.status).toBe(400);
    expect(ascii.body.error.details.password).toMatch(/72 bytes/);
    const multibyte = await post('/api/auth/register', validRegistration({ email: 'three@example.com', password: `${'é'.repeat(40)}1` })); // 81 bytes
    expect(multibyte.status).toBe(400);
    expect(multibyte.body.error.details.password).toMatch(/72 bytes/);
  });

  it('still needs a letter and a number', async () => {
    expect((await post('/api/auth/register', validRegistration({ password: '12345678' }))).status).toBe(400);
    expect((await post('/api/auth/register', validRegistration({ password: 'abcdefgh' }))).status).toBe(400);
  });
});

describe('test database guard (review item 9)', () => {
  it('refuses databases that are not clearly for tests', () => {
    expect(() => assertSafeTestDb('mongodb://127.0.0.1:27017/healthtwin')).toThrow(/contains "test"/);
    expect(() => assertSafeTestDb('mongodb://127.0.0.1:27017/')).toThrow(/Refusing/);
    expect(() => assertSafeTestDb('not a uri')).toThrow(/Refusing/);
  });
  it('allows test databases', () => {
    expect(() => assertSafeTestDb('mongodb://127.0.0.1:27017/healthtwin_test')).not.toThrow();
    expect(() => assertSafeTestDb('mongodb://u:p@host:27017/App_TEST?authSource=admin')).not.toThrow();
  });
});
