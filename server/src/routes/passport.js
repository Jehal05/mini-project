import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { guard } from '../auth/guard.js';
import { HOSPITAL_ROLES } from '../auth/roles.js';
import * as svc from '../patients/service.js';
import { isObjectIdString, validateBystanderReport } from '../patients/validate.js';
import { sendFile } from './fileResponse.js';

const router = Router();
router.param('docId', (_req, _res, next, v) => (isObjectIdString(v) ? next() : next(httpError(404, 'Not found'))));

// Hospital logins only (no dev-header fallback: the full record is never opened without a real sign-in).
const hospitalOnly = guard({ roles: HOSPITAL_ROLES, label: 'Hospital', bind: (req, user) => { req.actor = user; } });

// Public: the emergency tier only, plus the bystander report. Unknown, malformed and revoked tokens all answer the same 404.
router.get('/:token', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ passport: await svc.scan(req.params.token) });
}));
router.get('/:token/photo', asyncHandler(async (req, res) => sendFile(res, await svc.scanPhoto(req.params.token))));
router.post('/:token/report', asyncHandler(async (req, res, next) => {
  try { res.status(202).json(await svc.bystanderReport(req.params.token, validateBystanderReport(req.body), req.ip)); }
  catch (e) { if (e.retryAfter) res.set('Retry-After', String(e.retryAfter)); next(e); }
}));

router.get('/:token/full', hospitalOnly, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ patient: await svc.fullRecord(req.params.token, req.actor) });
}));
router.get('/:token/full/documents/:docId/file', hospitalOnly, asyncHandler(async (req, res) => sendFile(res, await svc.fullRecordDocument(req.params.token, req.params.docId, req.actor))));

export default router;
