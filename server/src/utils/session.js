import { config } from '../config/env.js';
import { Patient } from '../models/Patient.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { randomToken, sha256, signAccessToken } from './crypto.js';

export function cookieOptions() {
  return {
    httpOnly: true, // feature 2: the refresh token is never readable from JavaScript
    secure: config.isProd,
    sameSite: 'lax',
    path: config.session.cookiePath,
    maxAge: config.session.refreshTtlMs,
  };
}

export function clearRefreshCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.session.cookieName, opts);
}

/** Creates a refresh-token row (new family unless one is given) and returns the raw token. */
export async function issueRefreshToken(req, user, family = randomToken(16)) {
  const raw = randomToken();
  const now = Date.now();
  const doc = await RefreshToken.create({
    user: user._id,
    family,
    tokenHash: sha256(raw),
    expiresAt: new Date(now + config.session.refreshTtlMs),
    lastActivityAt: new Date(now),
    userAgent: req.get('user-agent')?.slice(0, 200),
    ip: req.ip,
  });
  return { raw, doc };
}

export const loadPatient = (user) => (user.role === 'patient' ? Patient.findOne({ user: user._id }) : null);

/** Sets the cookie and signs the access token for an already-issued refresh token. */
export function finishSession(res, { user, patient, raw, doc }) {
  res.cookie(config.session.cookieName, raw, cookieOptions());
  return { accessToken: signAccessToken({ user, patientId: patient?._id, session: doc }), refreshDoc: doc, user: publicUser(user, patient) };
}

/** Issues access + refresh tokens, sets the cookie and returns the access token + public user. */
export async function startSession(req, res, user, { family, patient } = {}) {
  const linkedPatient = patient ?? (await loadPatient(user));
  const { raw, doc } = await issueRefreshToken(req, user, family);
  return finishSession(res, { user, patient: linkedPatient, raw, doc });
}

/**
 * Ending a session: every access token minted for the login stops working at once, because
 * `authenticate` checks that the login's family still has a live refresh token.
 */
export const revokeFamily = (family) =>
  RefreshToken.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

/** Signs a user out everywhere. Call this when deactivating an account or changing its password. */
export const revokeUserSessions = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

export function publicUser(user, patient) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    hospitalId: user.hospitalId ? String(user.hospitalId) : undefined,
    patient: patient ? { id: String(patient._id), patientId: patient.patientId } : undefined,
  };
}
