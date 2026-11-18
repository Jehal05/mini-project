import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config/env.js';
import { RefreshToken } from '../src/models/index.js';
import { CSRF, agent, bearer, loginAs, makeUser } from './helpers.js';

const refresh = (ag) => ag.post('/api/auth/refresh').set(CSRF);
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith(config.session.cookieName));

describe('feature 100: secure session management', () => {
  it('sets a 7-day httpOnly refresh cookie scoped to the auth routes', async () => {
    const { res } = await loginAs(await makeUser());
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/Max-Age=604800/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body).not.toHaveProperty('refreshToken'); // never in the JSON body
  });

  it('silently refreshes: new access token, rotated refresh token, same user', async () => {
    const user = await makeUser();
    const { agent: ag, res: login } = await loginAs(user);
    const first = cookieOf(login);
    const res = await refresh(ag);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(String(user._id));
    expect(res.body.accessToken).toBeTruthy();
    expect(cookieOf(res)).not.toBe(first);
    const me = await ag.get('/api/auth/me').set(bearer(res.body.accessToken));
    expect(me.status).toBe(200);
  });

  it('requires the CSRF header on refresh and logout', async () => {
    const { agent: ag } = await loginAs(await makeUser());
    expect((await ag.post('/api/auth/refresh')).status).toBe(403);
    expect((await ag.post('/api/auth/logout')).status).toBe(403);
  });

  it('answers 401 NO_REFRESH_TOKEN when there is no cookie', async () => {
    const res = await refresh(agent());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
  });

  it('reports an expired access token so the client knows to refresh', async () => {
    const user = await makeUser();
    const expired = jwt.sign({ role: 'patient', sid: 'x' }, config.jwt.accessSecret, { subject: String(user._id), issuer: config.jwt.issuer, expiresIn: -10 });
    const res = await agent().get('/api/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects tampered, foreign and missing tokens', async () => {
    const { token } = await loginAs(await makeUser());
    const forged = jwt.sign({ role: 'central_admin' }, 'a-different-secret-that-is-long-enough-123', { subject: 'abc', issuer: config.jwt.issuer });
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${token.split('.')[1]}.`;
    for (const bad of [`${token}x`, forged, noneAlg]) {
      const res = await agent().get('/api/auth/me').set(bearer(bad));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    }
    expect((await agent().get('/api/auth/me')).body.error.code).toBe('NO_TOKEN');
  });

  it('logout revokes the refresh token, so it cannot be used again', async () => {
    const { agent: ag, res: login } = await loginAs(await makeUser());
    const stolen = cookieOf(login).split(';')[0];
    const out = await ag.post('/api/auth/logout').set(CSRF);
    expect(out.status).toBe(200);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);

    const replay = await agent().post('/api/auth/refresh').set(CSRF).set('Cookie', stolen);
    expect(replay.status).toBe(401);
  });

  it('ends a session that was idle for more than 30 minutes', async () => {
    const { agent: ag } = await loginAs(await makeUser());
    await RefreshToken.updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 31 * 60 * 1000) } });
    const res = await refresh(ag);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_IDLE');
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
  });

  it('keeps a session that was active within 30 minutes', async () => {
    const { agent: ag } = await loginAs(await makeUser());
    await RefreshToken.updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 29 * 60 * 1000) } });
    expect((await refresh(ag)).status).toBe(200);
  });

  it('counts authenticated API calls as activity', async () => {
    const { agent: ag, token } = await loginAs(await makeUser());
    await RefreshToken.updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 20 * 60 * 1000) } });
    await ag.get('/api/auth/me').set(bearer(token)).expect(200);
    await new Promise((r) => setTimeout(r, 150)); // the activity write is fire-and-forget
    const doc = await RefreshToken.findOne();
    expect(Date.now() - doc.lastActivityAt.getTime()).toBeLessThan(60 * 1000);
  });

  it('expires refresh tokens after 7 days', async () => {
    const { agent: ag } = await loginAs(await makeUser());
    await RefreshToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000), lastActivityAt: new Date() } });
    const res = await refresh(ag);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('treats a replayed, already-rotated token as theft and revokes the whole login', async () => {
    const { agent: ag, res: login } = await loginAs(await makeUser());
    const oldCookie = cookieOf(login).split(';')[0];
    await refresh(ag).expect(200); // legitimate rotation
    await RefreshToken.updateMany({ revokedAt: { $exists: true } }, { $set: { revokedAt: new Date(Date.now() - 60_000) } }); // outside the 10s grace window

    const replay = await agent().post('/api/auth/refresh').set(CSRF).set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
    expect((await refresh(ag)).status).toBe(401); // the legitimate holder is signed out too
  });

  it('lets only one of two simultaneous refreshes through', async () => {
    const { res: login } = await loginAs(await makeUser());
    const cookie = cookieOf(login).split(';')[0];
    const results = await Promise.all([1, 2].map(() => agent().post('/api/auth/refresh').set(CSRF).set('Cookie', cookie)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('logout-all signs the user out on every device', async () => {
    const user = await makeUser();
    const one = await loginAs(user);
    const two = await loginAs(user);
    await one.agent.post('/api/auth/logout-all').set(bearer(one.token)).expect(200);
    expect((await refresh(two.agent)).status).toBe(401);
  });

  it('refuses to refresh for a disabled account', async () => {
    const user = await makeUser();
    const { agent: ag } = await loginAs(user);
    user.isActive = false;
    await user.save();
    expect((await refresh(ag)).body.error.code).toBe('ACCOUNT_DISABLED');
  });
});
