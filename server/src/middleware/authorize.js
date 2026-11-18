import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { HOSPITAL_ROLES, ROLES } from '../models/User.js';
import { authenticate } from './authenticate.js';

async function deny(req, message, code, reason) {
  await writeAudit({ req, action: 'access.denied', resourceType: 'route', resourceId: `${req.method} ${req.baseUrl}${req.path}`, outcome: 'denied', meta: { reason } });
  return ApiError.forbidden(message, code);
}

/** Feature 6: allow only the listed roles. Use after `authenticate`. */
export function authorize(...allowed) {
  const unknown = allowed.filter((r) => !ROLES.includes(r));
  if (unknown.length) throw new Error(`authorize(): unknown role(s) ${unknown.join(', ')}`);
  return async (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(await deny(req, `The ${req.user.role} role cannot access this resource`, 'ROLE_FORBIDDEN', 'role'));
    }
    return next();
  };
}

/**
 * Feature 5/6: keeps hospital staff inside their own hospital.
 * - central_admin: allowed everywhere; req.hospitalId is the requested one (or null).
 * - doctor / hospital_staff / hospital_admin: the requested hospital id (default: params.hospitalId)
 *   must equal the hospitalId in their token; req.hospitalId is always forced to their own, so
 *   handlers should filter queries with it.
 * - patient: never allowed on hospital-scoped routes.
 */
export function hospitalScope(getRequestedId = (req) => req.params.hospitalId ?? req.body?.hospitalId ?? req.query?.hospitalId) {
  return async (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const { role, hospitalId: own } = req.user;
    const requested = getRequestedId(req);
    if (role === 'central_admin') {
      req.hospitalId = requested ? String(requested) : null;
      return next();
    }
    if (!HOSPITAL_ROLES.includes(role) || !own) {
      return next(await deny(req, 'This resource is only available to hospital accounts', 'HOSPITAL_ROLE_REQUIRED', 'no-hospital'));
    }
    if (requested && String(requested) !== String(own)) {
      return next(await deny(req, 'You can only access your own hospital', 'HOSPITAL_MISMATCH', 'hospital-mismatch'));
    }
    req.hospitalId = String(own);
    return next();
  };
}

/** Convenience: authenticate + role check (+ optional hospital scope) as one middleware list. */
export function protect({ roles, hospitalScoped = false, hospitalIdFrom } = {}) {
  const chain = [authenticate];
  if (roles?.length) chain.push(authorize(...roles));
  if (hospitalScoped) chain.push(hospitalScope(hospitalIdFrom));
  return chain;
}
