import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { env } from '../config/env.js';
import * as cases from '../services/caseService.js';
import * as repo from '../services/caseRepo.js';
import { notifyHospitals } from '../services/notifications.js';
import { parseCoords } from '../utils/query.js';

const hid = (req) => req.staff.hospitalId;

export const hospitalQueue = asyncHandler(async (req, res) => {
  if (req.params.id !== hid(req)) throw httpError(403, 'You can only view your own hospital queue');
  res.json(await cases.listQueue(hid(req), { sort: req.query.sort || 'priority' }));
});

export const hospitalDoctors = asyncHandler(async (req, res) => {
  if (req.params.id !== hid(req)) throw httpError(403, 'You can only view your own hospital');
  res.json({ results: await cases.listHospitalDoctors(hid(req)) });
});

export const detail = asyncHandler(async (req, res) => res.json(await cases.getCaseDetail(req.params.caseId, hid(req))));
export const patientInfo = asyncHandler(async (req, res) => res.json(await cases.getPatientInfo(req.params.caseId, hid(req), req.staff)));
export const accept = asyncHandler(async (req, res) => res.json(await cases.acceptCase(req.params.caseId, hid(req))));
export const reject = asyncHandler(async (req, res) => res.json(await cases.rejectCase(req.params.caseId, hid(req), req.body?.reason)));
export const doctor = asyncHandler(async (req, res) => res.json(await cases.assignDoctor(req.params.caseId, hid(req), req.body?.doctorId)));
export const preparation = asyncHandler(async (req, res) =>
  res.json(await cases.updatePreparation(req.params.caseId, hid(req), req.body?.item, req.body?.done)),
);
export const milestone = asyncHandler(async (req, res) => res.json(await cases.recordMilestone(req.params.caseId, hid(req), req.body?.name)));
export const timeline = asyncHandler(async (req, res) => res.json(await cases.getTimeline(req.params.caseId, hid(req))));

// Push subscription from a staff browser (feature 61)
export const savePushSubscription = asyncHandler(async (req, res) => {
  if (req.params.id !== hid(req)) throw httpError(403, 'You can only register push for your own hospital');
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw httpError(400, 'endpoint and keys are required');
  await repo.saveSubscription(hid(req), { endpoint, keys });
  res.status(201).json({ ok: true });
});

export const pushPublicKey = (req, res) => res.json({ publicKey: env.vapidPublicKey || null });

// Demo only: create a simulated critical case near a point and notify hospitals. Disabled in production.
export const demoEmergency = asyncHandler(async (req, res) => {
  if (env.nodeEnv === 'production') throw httpError(404, 'Not found');
  const { lat, lng } = parseCoords(req.body || {});
  const severity = ['low', 'moderate', 'high', 'critical'].includes(req.body?.severity) ? req.body.severity : 'critical';
  const created = await repo.createDemoEmergency({ lat, lng, severity });
  const result = await notifyHospitals(created.caseId);
  res.status(201).json({ ...created, ...result, simulated: true });
});
