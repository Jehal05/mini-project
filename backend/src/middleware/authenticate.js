import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/crypto.js';

const lastTouch = new Map(); // sid -> ms of last DB write

/** Records activity on the session (throttled) so the 30-minute idle rule sees real use. */
function touchSession(sid) {
  const now = Date.now();
  if (now - (lastTouch.get(sid) ?? 0) < config.session.activityTouchMs) return;
  lastTouch.set(sid, now);
  if (lastTouch.size > 5000) {
    for (const [key, at] of lastTouch) if (now - at > config.session.idleTimeoutMs) lastTouch.delete(key);
  }
  RefreshToken.updateOne({ _id: sid, revokedAt: { $exists: false } }, { $set: { lastActivityAt: new Date(now) } })
    .catch((err) => console.error('[session] touch failed', err.message));
}

/**
 * Turns an access token into req.user = { id, role, hospitalId, patientId, sid }, or throws an ApiError.
 * Besides the signature and expiry, it checks that the login is still live and the account still active,
 * so logout, password reset and deactivation take effect immediately instead of after 15 minutes.
 * Used by the HTTP middleware below and by the Socket.IO handshake, so both enforce the same rules.
 */
export async function userFromToken(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
  if (!payload.fam || !payload.sub || !payload.sid) throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');

  try {
    const [live, active] = await Promise.all([
      RefreshToken.exists({ family: payload.fam, revokedAt: { $exists: false } }),
      User.exists({ _id: payload.sub, isActive: true }),
    ]);
    if (!live || !active) throw ApiError.unauthorized('Your session has ended', 'SESSION_REVOKED');
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'CastError') throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
    throw err;
  }
  touchSession(payload.sid);
  return { id: payload.sub, role: payload.role, hospitalId: payload.hospitalId, patientId: payload.patientId, sid: payload.sid };
}

/** Requires `Authorization: Bearer <access token>` and sets req.user (see userFromToken). */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next(ApiError.unauthorized('Authentication required', 'NO_TOKEN'));
  try {
    req.user = await userFromToken(header.slice(7));
    return next();
  } catch (err) {
    return next(err);
  }
}
