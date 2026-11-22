import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as admin from '../controllers/adminController.js';

const router = Router();
router.use(requireAdmin); // OWNER: Jehal swaps this for real admin auth

router.get('/analytics/summary', admin.analyticsSummary); // 96

// Feature 99
router.post('/backups', admin.createBackup);
router.get('/backups', admin.listBackups);
router.post('/backups/:name/verify', admin.verifyBackup);
router.post('/backups/:name/restore', admin.restoreBackup); // dry run unless body.confirm is RESTORE
router.get('/export/:collection', admin.exportCollection); // hospitals, beds, ambulances, doctors only

export default router;
