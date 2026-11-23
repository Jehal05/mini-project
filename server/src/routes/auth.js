import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import * as auth from '../auth/service.js';
import { authenticate } from '../auth/guard.js';
import { passwordProblems } from '../auth/password.js';
import { registerPatient } from '../patients/service.js';

const COOKIE = 'ht_refresh';
const cookieOpts = () => ({ httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/api/auth', maxAge: env.refreshTtlDays * 86400000 });
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
const ctxOf = (req) => ({ userAgent: req.get('user-agent')?.slice(0, 200), ip: req.ip });

// Refresh and logout use a cookie, so they also need a header that other websites cannot send (CSRF defence).
const requireCsrfHeader = (req, _res, next) => (req.get('x-requested-with') === 'healthtwin' ? next() : next(httpError(403, 'Missing request header')));

// Small in-memory limiter per client address and route. Enough for one server; use a shared store when scaled out.
function limiter(max, windowMs = 15 * 60000) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max && env.nodeEnv !== 'test') return next(httpError(429, 'Too many attempts. Wait a few minutes and try again.'));
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10000) hits.clear();
    return next();
  };
}

const router = Router();
const withCode = (res, e) => res.status(e.status || 500).json({ error: e.status >= 500 ? 'Internal server error' : e.message, code: e.code });

// Feature 1: patients sign up themselves. Other roles are created by an administrator.
router.post('/register', limiter(10), asyncHandler(async (req, res) => res.status(201).json(await registerPatient(req.body))));

router.post('/login/:portal', limiter(30), asyncHandler(async (req, res) => {
  const out = await auth.login(req.params.portal, req.body ?? {}, ctxOf(req));
  res.cookie(COOKIE, out.refresh.raw, cookieOpts());
  res.json({ accessToken: out.accessToken, expiresInSeconds: env.accessTtlSeconds, user: out.user });
}));

router.post('/refresh', requireCsrfHeader, async (req, res, next) => {
  try {
    const out = await auth.refresh(readCookie(req, COOKIE), ctxOf(req));
    res.cookie(COOKIE, out.refresh.raw, cookieOpts());
    res.json({ accessToken: out.accessToken, expiresInSeconds: env.accessTtlSeconds, user: out.user });
  } catch (e) {
    if (e.status === 401) { const { maxAge, ...o } = cookieOpts(); res.clearCookie(COOKIE, o); return withCode(res, e); }
    return next(e);
  }
});

router.post('/logout', requireCsrfHeader, asyncHandler(async (req, res) => {
  await auth.logout(readCookie(req, COOKIE));
  const { maxAge, ...o } = cookieOpts();
  res.clearCookie(COOKIE, o);
  res.json({ ok: true });
}));

router.post('/logout-all', authenticate, asyncHandler(async (req, res) => { await auth.logoutEverywhere(req.user.id); res.json({ ok: true }); }));
router.get('/me', authenticate, asyncHandler(async (req, res) => res.json({ user: await auth.me(req.user.id) })));
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const problems = passwordProblems(req.body?.next);
  if (problems.length) throw httpError(400, problems.join(' '));
  await auth.changePassword(req.user.id, { current: req.body?.current, next: req.body?.next });
  res.json({ ok: true, message: 'Password changed. Sign in again.' });
}));

export default router;
