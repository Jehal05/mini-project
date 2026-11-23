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

const asList = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map(String));
const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Every hospital id the request names: route params, body and query string (or just the custom getter's). */
function requestedIds(req, getter) {
  if (getter) return asList(getter(req));
  return [...asList(req.params?.hospitalId), ...asList(req.body?.hospitalId), ...asList(req.query?.hospitalId)];
}

/**
 * Feature 5/6: keeps hospital staff inside their own hospital.
 * - central_admin: allowed everywhere; req.hospitalId is the requested one (or null).
 * - doctor / hospital_staff / hospital_admin: EVERY hospital id in the request (params, body, query) must
 *   equal the hospitalId in their token, otherwise 403. req.hospitalId is always their own, so handlers
 *   should filter queries and writes with it rather than with anything from the request.
 * - patient: never allowed on hospital-scoped routes.
 * Pass a getter to check one specific place instead: hospitalScope((req) => req.params.id).
 */
export function hospitalScope(getRequestedId) {
  return async (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const { role, hospitalId: own } = req.user;
    const ids = requestedIds(req, getRequestedId);

    if (role === 'central_admin') {
      const distinct = [...new Set(ids)];
      if (distinct.length > 1) return next(ApiError.badRequest('The request names more than one hospital'));
      if (distinct[0] && !OBJECT_ID.test(distinct[0])) return next(ApiError.badRequest('Invalid hospital id'));
      req.hospitalId = distinct[0] ?? null;
      return next();
    }
    if (!HOSPITAL_ROLES.includes(role) || !own) {
      return next(await deny(req, 'This resource is only available to hospital accounts', 'HOSPITAL_ROLE_REQUIRED', 'no-hospital'));
    }
    if (ids.some((id) => id !== String(own))) {
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
