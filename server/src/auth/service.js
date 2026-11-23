// Login, refresh and logout. Mirrors Jehal's design: short access token kept in memory by the client,
// rotating refresh token in an httpOnly cookie, replay detection, 30 minute idle limit, lockout after repeated failures.
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import * as repo from './authRepo.js';
import { randomToken, sha256, signJwt } from './tokens.js';
import { hashPassword, verifyPassword, passwordProblems } from './password.js';
import { HOSPITAL_ROLES } from './roles.js';

// Each login page accepts only its own roles.
export const PORTALS = Object.freeze({
  patient: ['patient'],
  doctor: ['doctor'],
  staff: ['hospital_staff', 'hospital_admin'],
  crew: ['ambulance_crew'],
  admin: ['central_admin'],
});

const sid = (v) => (v == null ? undefined : String(v));
const GENERIC = 'Incorrect email or password';
let dummyHash;

export function publicUser(u) {
  return {
    id: sid(u._id), name: u.name, email: u.email, role: u.role,
    hospitalId: sid(u.hospital), doctorId: sid(u.doctor), ambulanceId: sid(u.ambulance), patientId: sid(u.patient),
  };
}

function accessTokenFor(user, family, now) {
  return signJwt(
    { sub: sid(user._id), role: user.role, fam: family, hospitalId: sid(user.hospital), doctorId: sid(user.doctor), ambulanceId: sid(user.ambulance), patientId: sid(user.patient) },
    { secret: env.jwtSecret, ttlSeconds: env.accessTtlSeconds, now },
  );
}

async function issueRefresh(user, family, ctx, now) {
  const raw = randomToken();
  const expiresAt = new Date(now + env.refreshTtlDays * 86400000);
  await repo.saveRefresh({ user: user._id, family, tokenHash: sha256(raw), expiresAt, lastActivityAt: new Date(now), userAgent: ctx?.userAgent, ip: ctx?.ip });
  return { raw, expiresAt };
}

export function assertSecretIsSafe() {
  if (env.nodeEnv === 'production' && (!env.jwtSecret || env.jwtSecret === 'change-me-before-use' || env.jwtSecret.length < 32)) {
    throw httpError(503, 'Login is disabled until JWT_SECRET is set to a long random value');
  }
}

export async function login(portal, { email, password }, ctx = {}, now = Date.now()) {
  assertSecretIsSafe();
  const roles = PORTALS[portal];
  if (!roles) throw httpError(404, 'Unknown login page');
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) throw httpError(400, 'Enter your email and password');

  const user = await repo.findUserByEmail(email);
  if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    const mins = Math.ceil((new Date(user.lockedUntil).getTime() - now) / 60000);
    throw Object.assign(httpError(429, `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`), { code: 'LOCKED' });
  }
  // Compare against a dummy hash when the account is missing, so timing does not reveal which emails exist.
  dummyHash ??= await hashPassword('not-a-real-password');
  const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok || !user.isActive || !roles.includes(user.role)) {
    if (user && !ok) await repo.recordFailure(user._id, { max: env.maxFailedLogins, lockMs: env.lockoutMinutes * 60000, now });
    throw Object.assign(httpError(401, GENERIC), { code: 'BAD_CREDENTIALS' });
  }
  if (HOSPITAL_ROLES.includes(user.role) && !user.hospital) throw httpError(403, 'This account is not linked to a hospital. Ask your admin.');
  if (user.role === 'doctor' && !user.doctor) throw httpError(403, 'This account is not linked to a doctor record. Ask your admin.');
  if (user.role === 'ambulance_crew' && !user.ambulance) throw httpError(403, 'This account is not linked to an ambulance. Ask your admin.');

  await repo.recordSuccess(user._id, now);
  const family = randomToken(16);
  const refresh = await issueRefresh(user, family, ctx, now);
  return { accessToken: accessTokenFor(user, family, now), refresh, user: publicUser(user) };
}

export async function refresh(rawToken, ctx = {}, now = Date.now()) {
  assertSecretIsSafe();
  const lost = (m = 'Your session has ended. Sign in again.', code = 'SESSION_ENDED') => Object.assign(httpError(401, m), { code });
  if (!rawToken) throw lost('Sign in to continue.', 'NO_SESSION');
  const row = await repo.findRefresh(sha256(rawToken));
  if (!row) throw lost();
  if (row.revokedAt) { await repo.revokeFamily(row.family, now); throw lost('Your session was used somewhere else, so it was ended. Sign in again.', 'SESSION_REUSED'); }
  if (new Date(row.expiresAt).getTime() <= now) throw lost();
  if (now - new Date(row.lastActivityAt).getTime() > env.idleTimeoutMinutes * 60000) { await repo.revokeFamily(row.family, now); throw lost('You were signed out after a period of no activity.', 'IDLE'); }
  const user = await repo.findUserById(row.user);
  if (!user || !user.isActive) { await repo.revokeFamily(row.family, now); throw lost(); }
  if (!(await repo.revokeRefreshOnce(row._id, now))) { await repo.revokeFamily(row.family, now); throw lost('Your session was used somewhere else, so it was ended. Sign in again.', 'SESSION_REUSED'); }
  const next = await issueRefresh(user, row.family, ctx, now);
  return { accessToken: accessTokenFor(user, row.family, now), refresh: next, user: publicUser(user) };
}

export async function logout(rawToken, now = Date.now()) {
  if (!rawToken) return;
  const row = await repo.findRefresh(sha256(rawToken));
  if (row) await repo.revokeFamily(row.family, now);
}
export const logoutEverywhere = (userId, now = Date.now()) => repo.revokeAllForUser(userId, now);

export async function me(userId) {
  const u = await repo.findUserById(userId);
  if (!u || !u.isActive) throw httpError(401, 'Your session has ended');
  return publicUser(u);
}

export async function changePassword(userId, { current, next }, now = Date.now()) {
  const u = await repo.findUserByEmail((await repo.findUserById(userId))?.email ?? '');
  if (!u || !(await verifyPassword(String(current ?? ''), u.passwordHash))) throw httpError(400, 'Your current password is not correct');
  const problems = passwordProblems(next);
  if (problems.length) throw httpError(400, problems.join(' '));
  await repo.setPassword(userId, await hashPassword(next));
  await repo.revokeAllForUser(userId, now); // every login, including this one, must sign in again
}
