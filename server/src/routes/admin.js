import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as admin from '../controllers/adminController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as tools from '../admintools/service.js';
import { validateAuditQuery, validateHospitalRegistration } from '../admintools/validate.js';

const router = Router();
router.use(requireAdmin); // OWNER: Jehal swaps this for real admin auth

router.get('/analytics/summary', admin.analyticsSummary); // 96

// Feature 99
router.post('/backups', admin.createBackup);
router.get('/backups', admin.listBackups);
router.post('/backups/:name/verify', admin.verifyBackup);
router.post('/backups/:name/restore', admin.restoreBackup); // dry run unless body.confirm is RESTORE
router.get('/export/:collection', admin.exportCollection); // hospitals, beds, ambulances, doctors only

// Features 98 (audit log), 81 (register a hospital) and the command-centre map
router.get('/audit', asyncHandler(async (req, res) => res.json(await tools.listAudit(validateAuditQuery(req.query)))));
router.post('/hospitals', asyncHandler(async (req, res) => res.status(201).json(await tools.registerHospital(validateHospitalRegistration(req.body), req.admin))));
router.get('/overview', asyncHandler(async (_req, res) => res.json(await tools.overview())));

export default router;
