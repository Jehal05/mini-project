import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
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

/** Requires `Authorization: Bearer <access token>` and sets req.user = { id, role, hospitalId, patientId, sid }. */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next(ApiError.unauthorized('Authentication required', 'NO_TOKEN'));
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = {
      id: payload.sub,
      role: payload.role,
      hospitalId: payload.hospitalId,
      patientId: payload.patientId,
      sid: payload.sid,
    };
    touchSession(payload.sid);
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED'));
    return next(ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN'));
  }
}
