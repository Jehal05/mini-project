// Who may see or change monitoring data. Uses our sign-in (the same Bearer token as every other screen).
//   patient                                    only their own live vitals, history, detection
//   doctor, hospital staff, hospital admin     any patient (narrowing this to "on one of my cases" comes with the SOS phase)
//   central_admin                              everything, and the only role that can change scenarios and thresholds
// With DEV_AUTH on (or in tests) a request without a token is allowed, like the other dev-only routes.
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import { hasBearer, userFromRequest } from '../auth/guard.js';
import { verifyJwt } from '../auth/tokens.js';
import { assertSecretIsSafe } from '../auth/service.js';
import * as authRepo from '../auth/authRepo.js';

const CLINICAL = ['doctor', 'hospital_staff', 'hospital_admin', 'central_admin'];
const fail = (status, message, code) => Object.assign(httpError(status, message), { code });

/** Sets req.user when a token is sent. Without one it is allowed only in dev mode. */
export const monitorGuard = async (req, _res, next) => {
  try {
    if (hasBearer(req)) req.user = await userFromRequest(req);
    else if (!env.devAuth) throw fail(401, 'Sign in to continue', 'NO_TOKEN');
    next();
  } catch (e) { next(e); }
};

const roleGuard = (roles, what) => (req, _res, next) => {
  if (!req.user) return env.devAuth ? next() : next(fail(401, 'Sign in to continue', 'NO_TOKEN'));
  return roles.includes(req.user.role) ? next() : next(fail(403, `${what} needs one of: ${roles.join(', ').replace(/_/g, ' ')}`, 'ROLE_FORBIDDEN'));
};
export const presenterGuard = roleGuard(['central_admin'], 'Changing scenarios or detection settings');
export const doctorGuard = roleGuard(['doctor', 'central_admin'], 'Changing a patient threshold');

/** May this request's user see this patient? `patient._id` is the Patient id. No user means dev mode. */
export function canAccess(req, patient) {
  const u = req.user;
  if (!u) return env.devAuth;
  if (u.role === 'patient') return Boolean(u.patientId) && String(u.patientId) === String(patient._id);
  return CLINICAL.includes(u.role);
}

/** For the vitals:subscribe socket event. The token is sent in the socket's handshake: io(url, { auth: { token } }). */
export function socketAuthorizer({ patientExists = async () => true } = {}) {
  return async function authorizeSubscribe(socket, patientId) {
    const token = socket.handshake?.auth?.token;
    if (!token) return env.devAuth;
    try {
      assertSecretIsSafe();
      const p = verifyJwt(token, { secret: env.jwtSecret, now: Date.now() });
      if (!p.sub || !p.fam || !(await authRepo.familyIsLive(p.fam)) || !(await authRepo.userIsActive(p.sub))) return false;
      if (p.role === 'patient') return Boolean(p.patientId) && String(p.patientId) === String(patientId);
      return CLINICAL.includes(p.role) && (await patientExists(patientId));
    } catch { return false; }
  };
}
