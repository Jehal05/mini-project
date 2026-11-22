// Alternative hospitals (feature 60). Phase 9 (notification) calls these:
//   prepareCandidates(caseId)   -> ranks hospitals for the case and stores the order
//   markNotified(caseId, id)    -> call right after emitting hospital:alert
//   markRejected(caseId, id)    -> call when a hospital rejects
//   nextHospital(caseId)        -> who to notify next
import { env } from '../config/env.js';
import { EmergencyCase } from '../models/index.js';
import { rankNearby } from './hospitalService.js';
import { httpError } from '../utils/httpError.js';
import { pickNextHospital } from './pickNext.js';

export { pickNextHospital };

async function loadCase(caseId) {
  const doc = await EmergencyCase.findById(caseId);
  if (!doc) throw httpError(404, 'Emergency case not found');
  return doc;
}

export async function prepareCandidates(caseId, { radiusKm = 25 } = {}) {
  const doc = await loadCase(caseId);
  const [lng, lat] = doc.location.coordinates;
  const { results } = await rankNearby({ lat, lng, radiusKm, filters: { cardiacOnly: true } });
  doc.candidateHospitals = results.map((r) => r.id);
  await doc.save();
  return results;
}

export async function markNotified(caseId, hospitalId) {
  await EmergencyCase.updateOne(
    { _id: caseId, 'notifiedHospitals.hospital': { $ne: hospitalId } },
    { $push: { notifiedHospitals: { hospital: hospitalId, notifiedAt: new Date() } } },
  );
}

export async function markRejected(caseId, hospitalId) {
  await EmergencyCase.updateOne({ _id: caseId }, { $addToSet: { rejectedHospitals: hospitalId } });
}

export async function nextHospital(caseId, { timeoutSeconds = env.noAnswerTimeoutSeconds, now } = {}) {
  let doc = await loadCase(caseId);
  if (doc.status !== 'pending') return { next: null, reason: `case is ${doc.status}`, unresponsive: [], pending: [], exhausted: false };

  if (!doc.candidateHospitals?.length) {
    await prepareCandidates(caseId);
    doc = await loadCase(caseId);
  }

  return pickNextHospital({
    candidates: doc.candidateHospitals,
    rejected: doc.rejectedHospitals,
    notified: doc.notifiedHospitals,
    now,
    timeoutMs: timeoutSeconds * 1000,
  });
}
