import { config } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Patient } from '../models/Patient.js';
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

/** Issues access + refresh tokens, sets the cookie and returns the access token + public user. */
export async function startSession(req, res, user, { family, patient } = {}) {
  const linkedPatient = patient ?? (user.role === 'patient' ? await Patient.findOne({ user: user._id }) : null);
  const { raw, doc } = await issueRefreshToken(req, user, family);
  res.cookie(config.session.cookieName, raw, cookieOptions());
  const accessToken = signAccessToken({ user, patientId: linkedPatient?._id, sid: doc._id });
  return { accessToken, refreshDoc: doc, user: publicUser(user, linkedPatient) };
}

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
