import { asyncHandler } from '../utils/asyncHandler.js';
import { getSummary } from '../services/analytics.js';
import { getBackupService } from '../services/backupDefault.js';

export const analyticsSummary = asyncHandler(async (req, res) => res.json(await getSummary(req.query)));


const actorOf = (req) => req.admin?.userId;
export const createBackup = asyncHandler(async (req, res) => res.status(201).json(await getBackupService().createBackup({ actor: actorOf(req) })));
export const listBackups = asyncHandler(async (req, res) => res.json(await getBackupService().listBackups()));
export const verifyBackup = asyncHandler(async (req, res) => res.json(await getBackupService().verifyBackup(req.params.name, { actor: actorOf(req) })));
export const restoreBackup = asyncHandler(async (req, res) =>
  res.json(await getBackupService().restoreBackup(req.params.name, { actor: actorOf(req), confirm: req.body?.confirm })),
);
export const exportCollection = asyncHandler(async (req, res) => {
  const out = await getBackupService().exportCollection(req.params.collection, { format: req.query.format || 'json', actor: actorOf(req) });
  res.set('Content-Type', out.contentType).set('Content-Disposition', `attachment; filename="${out.filename}"`).send(out.body);
});
