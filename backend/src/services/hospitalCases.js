import { HospitalCase } from '../models/HospitalCase.js';

/**
 * Contract for Puneet's notify / accept / reject flow (features 53-57, 62, 90). The hospital portal reads these rows.
 *
 *   await recordHospitalCase({ hospitalId, emergencyCaseId, patientId: 'HT-2026-0001', summary, severity })
 *       Call when a hospital is notified. Safe to call twice for the same case (returns the existing row).
 *   await updateHospitalCase({ hospitalId, emergencyCaseId }, { status: 'accepted', etaMinutes: 12 })
 *       status: received | accepted | rejected | arrived | closed (admitted is set by the admission flow).
 *       respondedAt / arrivedAt / closedAt are filled in automatically.
 */
export async function recordHospitalCase({ hospitalId, emergencyCaseId, patient, patientId, summary, severity, receivedAt }) {
  const filter = { hospital: hospitalId, emergencyCaseId: String(emergencyCaseId) };
  return HospitalCase.findOneAndUpdate(
    filter,
    { $setOnInsert: { ...filter, patient, patientId, summary, severity, receivedAt: receivedAt ?? new Date(), status: 'received' } },
    { upsert: true, returnDocument: 'after' },
  );
}

export async function updateHospitalCase({ hospitalId, emergencyCaseId }, changes) {
  const set = { ...changes };
  const now = new Date();
  if (['accepted', 'rejected'].includes(changes.status)) set.respondedAt = changes.respondedAt ?? now;
  if (changes.status === 'arrived') set.arrivedAt = changes.arrivedAt ?? now;
  if (changes.status === 'closed') set.closedAt = changes.closedAt ?? now;
  return HospitalCase.findOneAndUpdate({ hospital: hospitalId, emergencyCaseId: String(emergencyCaseId) }, { $set: set }, { returnDocument: 'after' });
}
