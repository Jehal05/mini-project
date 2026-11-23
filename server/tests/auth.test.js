import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('../src/auth/authRepo.js', async () => await import('./helpers/fakeAuthRepo.js'));

import { signJwt, verifyJwt } from '../src/auth/tokens.js';
import { hashPassword, verifyPassword, passwordProblems } from '../src/auth/password.js';
import * as auth from '../src/auth/service.js';
import { userFromRequest, guard } from '../src/auth/guard.js';
import { env } from '../src/config/env.js';
import { addUser, resetAuth, store } from './helpers/fakeAuthRepo.js';
import { oid } from './helpers/fakeDb.js';

const PW = 'Correct#Horse9';
const H1 = oid(1);
const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });
let hash;
beforeAll(async () => { hash = await hashPassword(PW); });
beforeEach(() => resetAuth());

describe('tokens', () => {
  const secret = 's'.repeat(40);
  it('signs and verifies, and rejects tampering, wrong secret and expiry', () => {
    const t = signJwt({ sub: 'a', role: 'doctor' }, { secret, ttlSeconds: 60, now: 1_000_000 });
    expect(verifyJwt(t, { secret, now: 1_030_000 })).toMatchObject({ sub: 'a', role: 'doctor' });
    expect(() => verifyJwt(t, { secret: 'x'.repeat(40), now: 1_030_000 })).toThrow(/Invalid/);
    const [h, b, s] = t.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'a', role: 'central_admin', exp: 9e9 })).toString('base64url')}.${s}`;
    expect(() => verifyJwt(forged, { secret, now: 1_030_000 })).toThrow(/Invalid/);
    expect(() => verifyJwt(t, { secret, now: 1_100_000 })).toThrow(/expired/);
    expect(() => verifyJwt('nope', { secret })).toThrow(/Invalid/);
    expect(() => verifyJwt(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${b}.`, { secret, now: 1_030_000 })).toThrow(/Invalid/);
  });
});

describe('passwords', () => {
  it('hashes with a salt and verifies', async () => {
    const a = await hashPassword(PW); const b = await hashPassword(PW);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
    expect(await verifyPassword(PW, 'garbage')).toBe(false);
  });
  it('explains weak passwords', () => {
    expect(passwordProblems('short')).not.toHaveLength(0);
    expect(passwordProblems('alllowercase123')).toContain('Use both upper and lower case letters.');
    expect(passwordProblems(PW)).toEqual([]);
  });
});

describe('login', () => {
  it('signs a doctor in on the doctor page only, and returns ids from the account', async () => {
    addUser({ email: 'd@x.test', passwordHash: hash, role: 'doctor', hospital: H1, doctor: oid(901) });
    const out = await auth.login('doctor', { email: 'D@x.test', password: PW });
    expect(out.user).toMatchObject({ role: 'doctor', hospitalId: H1, doctorId: oid(901) });
    expect(verifyJwt(out.accessToken, { secret: env.jwtSecret })).toMatchObject({ role: 'doctor', hospitalId: H1 });
    expect(JSON.stringify(out)).not.toMatch(/passwordHash/);
    await expect(auth.login('staff', { email: 'd@x.test', password: PW })).rejects.toMatchObject({ status: 401, code: 'BAD_CREDENTIALS' });
    await expect(auth.login('nowhere', { email: 'd@x.test', password: PW })).rejects.toMatchObject({ status: 404 });
  });
  it('gives the same answer for a wrong password and an unknown email', async () => {
    addUser({ email: 'a@x.test', passwordHash: hash, role: 'central_admin' });
    const wrong = await auth.login('admin', { email: 'a@x.test', password: 'nope' }).catch((e) => e);
    const none = await auth.login('admin', { email: 'zzz@x.test', password: 'nope' }).catch((e) => e);
    expect(wrong.message).toBe(none.message);
    expect(wrong.status).toBe(401);
  });
  it('locks the account after repeated failures, then lets it back in later', async () => {
    addUser({ email: 'l@x.test', passwordHash: hash, role: 'central_admin' });
    const now = Date.now();
    for (let i = 0; i < env.maxFailedLogins; i += 1) await auth.login('admin', { email: 'l@x.test', password: 'bad' }, {}, now).catch(() => {});
    await expect(auth.login('admin', { email: 'l@x.test', password: PW }, {}, now + 1000)).rejects.toMatchObject({ status: 429, code: 'LOCKED' });
    const later = now + (env.lockoutMinutes + 1) * 60000;
    expect((await auth.login('admin', { email: 'l@x.test', password: PW }, {}, later)).user.role).toBe('central_admin');
  });
  it('refuses disabled accounts and accounts missing their link', async () => {
    addUser({ email: 'off@x.test', passwordHash: hash, role: 'central_admin', isActive: false });
    await expect(auth.login('admin', { email: 'off@x.test', password: PW })).rejects.toMatchObject({ status: 401 });
    addUser({ email: 'nolink@x.test', passwordHash: hash, role: 'doctor', hospital: H1 });
    await expect(auth.login('doctor', { email: 'nolink@x.test', password: PW })).rejects.toMatchObject({ status: 403 });
    addUser({ email: 'nohosp@x.test', passwordHash: hash, role: 'hospital_staff' });
    await expect(auth.login('staff', { email: 'nohosp@x.test', password: PW })).rejects.toMatchObject({ status: 403 });
  });
  it('validates input', async () => {
    await expect(auth.login('admin', {})).rejects.toMatchObject({ status: 400 });
  });
});

describe('refresh and logout', () => {
  async function signedIn() {
    addUser({ email: 's@x.test', passwordHash: hash, role: 'hospital_staff', hospital: H1 });
    return auth.login('staff', { email: 's@x.test', password: PW });
  }
  it('rotates the refresh token, and a replayed old token ends the whole login', async () => {
    const a = await signedIn();
    const b = await auth.refresh(a.refresh.raw);
    expect(b.refresh.raw).not.toBe(a.refresh.raw);
    await expect(auth.refresh(a.refresh.raw)).rejects.toMatchObject({ code: 'SESSION_REUSED' });
    await expect(auth.refresh(b.refresh.raw)).rejects.toMatchObject({ status: 401 }); // family is dead now
    expect(await userFromRequest(bearer(b.accessToken)).catch((e) => e.code)).toBe('SESSION_REVOKED');
  });
  it('ends the session after the idle limit, and when there is no cookie', async () => {
    const a = await signedIn();
    const later = Date.now() + (env.idleTimeoutMinutes + 1) * 60000;
    await expect(auth.refresh(a.refresh.raw, {}, later)).rejects.toMatchObject({ code: 'IDLE' });
    await expect(auth.refresh(undefined)).rejects.toMatchObject({ code: 'NO_SESSION' });
  });
  it('logout makes the access token stop working at once', async () => {
    const a = await signedIn();
    expect((await userFromRequest(bearer(a.accessToken))).role).toBe('hospital_staff');
    await auth.logout(a.refresh.raw);
    await expect(userFromRequest(bearer(a.accessToken))).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  it('deactivating the account ends access immediately', async () => {
    const a = await signedIn();
    store.users.get(a.user.id).isActive = false;
    await expect(userFromRequest(bearer(a.accessToken))).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  it('changing the password signs every login out', async () => {
    const a = await signedIn();
    await expect(auth.changePassword(a.user.id, { current: 'wrong', next: 'Another#Pass12' })).rejects.toMatchObject({ status: 400 });
    await auth.changePassword(a.user.id, { current: PW, next: 'Another#Pass12' });
    await expect(userFromRequest(bearer(a.accessToken))).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect((await auth.login('staff', { email: 's@x.test', password: 'Another#Pass12' })).user.role).toBe('hospital_staff');
  });
});

describe('role guards', () => {
  const run = async (mw, req) => { const out = {}; await mw(req, { status: (c) => ({ json: (b) => { out.res = { c, b }; } }) }, (e) => { out.next = e ?? 'ok'; }); return out; };
  it('binds req.staff from the account, and blocks other roles', async () => {
    const mk = (role, extra) => addUser({ email: `${role}@x.test`, passwordHash: hash, role, ...extra });
    mk('hospital_staff', { hospital: H1 }); mk('central_admin', {}); mk('patient', {});
    const staffToken = (await auth.login('staff', { email: 'hospital_staff@x.test', password: PW })).accessToken;
    const adminToken = (await auth.login('admin', { email: 'central_admin@x.test', password: PW })).accessToken;
    const patientToken = (await auth.login('patient', { email: 'patient@x.test', password: PW })).accessToken;

    const g = guard({ label: 'Hospital staff', roles: ['hospital_staff', 'hospital_admin', 'doctor'], bind: (req, u) => { req.staff = { hospitalId: u.hospitalId }; } });
    const ok = { ...bearer(staffToken) }; expect((await run(g, ok)).next).toBe('ok'); expect(ok.staff.hospitalId).toBe(H1);
    expect((await run(g, bearer(adminToken))).next).toMatchObject({ status: 403, code: 'ROLE_FORBIDDEN' });
    expect((await run(g, bearer(patientToken))).next).toMatchObject({ status: 403 });
    expect((await run(g, bearer('garbage'))).next).toMatchObject({ status: 401 });
  });
  it('the old dev headers work only when devAuth is on (tests), and never override a Bearer token', async () => {
    let calls = 0;
    const legacy = (_r, _s, next) => { calls += 1; next(); };
    const g = guard({ label: 'X', roles: ['doctor'], bind() {}, legacy });
    expect(env.devAuth).toBe(true); // vitest sets NODE_ENV=test
    expect((await run(g, { headers: {} })).next).toBe('ok');
    expect(calls).toBe(1);
    await run(g, bearer('garbage'));
    expect(calls).toBe(1);
    env.devAuth = false;
    try { expect((await run(g, { headers: {} })).res.c).toBe(401); } finally { env.devAuth = true; }
  });
});
