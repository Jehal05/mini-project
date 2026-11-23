import { ApiError } from '../utils/ApiError.js';

/** Cookie-authenticated endpoints (refresh, logout) need a header a cross-site form cannot send. */
export function requireCsrfHeader(req, _res, next) {
  if (req.get('X-Requested-With') !== 'healthtwin') return next(ApiError.forbidden('Missing request header', 'CSRF_HEADER_REQUIRED'));
  return next();
}
