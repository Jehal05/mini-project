import { Router } from 'express';
import { ApiError } from '../utils/ApiError.js';
import * as passport from '../controllers/passport.controller.js';
import { protect, validate } from '../middleware/index.js';
import { limiter } from '../middleware/rateLimit.js';
import { bystanderReportSchema } from '../utils/profileSchemas.js';

const router = Router();
router.param('docId', (_req, _res, next, v) => (/^[a-f\d]{24}$/i.test(v) ? next() : next(ApiError.notFound('Not found'))));
const HOSPITAL = ['doctor', 'hospital_staff', 'hospital_admin'];

// Public routes (no login): limited per IP. The report route has its own exact per-IP and per-patient quotas too.
router.get('/:token', limiter(60), passport.scan);
router.get('/:token/photo', limiter(120), passport.scanPhoto);
router.post('/:token/report', limiter(30), validate(bystanderReportSchema), passport.report);

// Hospital logins only: the full record behind the QR (feature 20), every view audited.
router.get('/:token/full', protect({ roles: HOSPITAL }), passport.fullRecord);
router.get('/:token/full/documents/:docId/file', protect({ roles: HOSPITAL }), passport.fullRecordDocument);

export default router;
