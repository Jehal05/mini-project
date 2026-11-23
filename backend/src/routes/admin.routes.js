import { Router } from 'express';
import * as c from '../controllers/adminHospitals.controller.js';
import { protect, validate } from '../middleware/index.js';
import express from 'express';
import { emergencyAnalytics, prioritisedQueue } from '../services/analytics.js';
import { createBackup, restoreBackup, validateBackup } from '../services/backup.js';
import { writeAudit } from '../utils/audit.js';
import { ApiError } from '../utils/ApiError.js';
import { hospitalCreateSchema, hospitalUpdateSchema } from '../utils/hospitalSchemas.js';

/** Central Admin API, mounted at /api/admin. Central admins only. */
const router = Router();
router.param('id', (_req, _res, next, v) => (/^[a-f\d]{24}$/i.test(v) ? next() : next(ApiError.notFound('Not found'))));
router.use(protect({ roles: ['central_admin'] }));

router.get('/hospitals', c.listHospitals);
router.post('/hospitals', validate(hospitalCreateSchema), c.createHospital);
router.get('/hospitals/:id', c.getHospital);
router.patch('/hospitals/:id', validate(hospitalUpdateSchema), c.updateHospital);

// Feature 95: every live emergency, most urgent first. Feature 96: analytics.
router.get('/emergencies', async (_req, res) => res.json({ items: await prioritisedQueue(), serverNow: new Date().toISOString(), simulated: true }));
router.get('/analytics', async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  res.json(await emergencyAnalytics({ days }));
});

// Feature 99: export, check and restore. Every use is audited. Restore needs the word RESTORE in the confirm field.
const bigJson = express.json({ limit: '50mb' });
router.get('/backup', async (req, res) => {
  const file = await createBackup();
  await writeAudit({ req, action: 'backup.export', resourceType: 'database', meta: { counts: file.counts }, strict: true });
  res.setHeader('Content-Disposition', `attachment; filename="healthtwin-backup-${file.createdAt.slice(0, 10)}.json"`);
  res.json(file);
});
router.post('/backup/check', bigJson, async (req, res) => res.json(await validateBackup(req.body?.file)));
router.post('/backup/restore', bigJson, async (req, res) => {
  if (req.body?.confirm !== 'RESTORE') throw ApiError.badRequest('Type RESTORE to confirm. Restoring replaces the current data.');
  try {
    const restored = await restoreBackup(req.body?.file);
    await writeAudit({ req, action: 'backup.restore', resourceType: 'database', meta: { restored }, strict: true });
    res.json({ restored });
  } catch (err) {
    if (err.status === 400 && err.details) throw new ApiError(400, 'BACKUP_INVALID', err.message, { problems: err.details });
    throw err;
  }
});

export default router;
