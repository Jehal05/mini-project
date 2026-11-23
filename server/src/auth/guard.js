// Request authentication. `authenticate` checks the Bearer token, the live session and the active account.
// `guard` builds the four role middlewares (hospital staff, doctor, crew, admin) that routes already use.
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import * as repo from './authRepo.js';
import { verifyJwt } from './tokens.js';
import { assertSecretIsSafe } from './service.js';

const fail = (status, message, code) => Object.assign(httpError(status, message), { code });
export const hasBearer = (req) => (req.headers.authorization || '').startsWith('Bearer ');

const lastTouch = new Map();
function touch(family, now) {
  if (now - (lastTouch.get(family) ?? 0) < 60000) return; // at most one database write a minute per login
  lastTouch.set(family, now);
  if (lastTouch.size > 5000) lastTouch.clear();
  repo.touchFamily(family, now).catch((e) => console.error('[auth] touch failed', e.message));
}

/** Returns { id, role, hospitalId, doctorId, ambulanceId, patientId, family } or throws a 401. */
export async function userFromRequest(req, now = Date.now()) {
  assertSecretIsSafe();
  if (!hasBearer(req)) throw fail(401, 'Sign in to continue', 'NO_TOKEN');
  let p;
  try { p = verifyJwt(req.headers.authorization.slice(7), { secret: env.jwtSecret, now }); } catch (e) { throw fail(401, e.message, e.code || 'INVALID_TOKEN'); }
  if (!p.sub || !p.fam) throw fail(401, 'Invalid access token', 'INVALID_TOKEN');
  const [live, active] = await Promise.all([repo.familyIsLive(p.fam), repo.userIsActive(p.sub)]);
  if (!live || !active) throw fail(401, 'Your session has ended', 'SESSION_REVOKED');
  touch(p.fam, now);
  return { id: p.sub, role: p.role, hospitalId: p.hospitalId, doctorId: p.doctorId, ambulanceId: p.ambulanceId, patientId: p.patientId, family: p.fam };
}

export const authenticate = async (req, _res, next) => {
  try { req.user = await userFromRequest(req); next(); } catch (e) { next(e); }
};

/**
 * roles:  roles allowed on this route.
 * bind:   (req, user) sets req.staff / req.doctor / req.crew / req.admin from the signed-in user.
 * legacy: the old dev-header check. Used only when DEV_AUTH is on (or in tests) and no Bearer token was sent.
 */
export function guard({ roles, bind, legacy, label }) {
  return async (req, res, next) => {
    try {
      if (hasBearer(req)) {
        const user = await userFromRequest(req);
        if (!roles.includes(user.role)) throw fail(403, `${label} access only. You are signed in as ${user.role.replace(/_/g, ' ')}.`, 'ROLE_FORBIDDEN');
        req.user = user;
        bind(req, user);
        return next();
      }
      if (env.devAuth && legacy) return legacy(req, res, next);
      return res.status(401).json({ error: `${label} sign in required`, code: 'NO_TOKEN' });
    } catch (e) { return next(e); }
  };
}
