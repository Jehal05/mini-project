// Ambulance assignment (feature 73). After a hospital accepts a case, reserve its nearest free ambulance
// (ALS first). Reserving is one atomic update, so two cases can never get the same ambulance.
import * as ambulanceRepo from './ambulanceRepo.js';
import * as tripRepo from './tripRepo.js';
import * as caseRepo from './caseRepo.js';
import { rankAmbulances } from './fleetLogic.js';
import { ambulanceView } from './fleetService.js';
import { httpError } from '../utils/httpError.js';
import { isObjectId } from '../utils/ids.js';

const casePoint = (c) => ({ lat: c.location.coordinates[1], lng: c.location.coordinates[0] });

export async function autoAssign(caseId) {
  const c = await caseRepo.getCase(caseId);
  if (!c || !c.hospital || c.status !== 'accepted') return { assigned: false, reason: 'case_not_ready' };
  if (c.ambulance) return { assigned: true, ambulanceId: String(c.ambulance), already: true };

  const free = await ambulanceRepo.listFreeAmbulances(c.hospital);
  const ranked = rankAmbulances(free, casePoint(c));

  for (const a of ranked) {
    const claimed = await ambulanceRepo.claimAmbulance(a._id, caseId, c.hospital);
    if (!claimed) continue; // another case took it a moment ago, try the next one

    const updated = await tripRepo.assignAmbulanceToCase(caseId, c.hospital, a._id);
    if (!updated) {
      await ambulanceRepo.releaseAmbulance(a._id, caseId);
      return { assigned: false, reason: 'case_changed' };
    }
    await caseRepo.pushTimeline(caseId, { event: 'ambulance_assigned', hospital: c.hospital, detail: a.vehicleNumber, at: new Date() });
    return { assigned: true, ambulanceId: String(a._id), type: a.type, distanceKm: a.distanceKm };
  }

  await caseRepo.pushTimeline(caseId, { event: 'no_ambulance_available', hospital: c.hospital, at: new Date() });
  return { assigned: false, reason: 'none_available' };
}

// Called from the accept flow. An ambulance problem must never undo or fail an accepted emergency.
export async function autoAssignSafely(caseId) {
  try {
    return await autoAssign(caseId);
  } catch (err) {
    console.error('[assignment] auto-assign failed:', err.message);
    return { assigned: false, reason: 'error' };
  }
}

// Staff override (feature 73). The new ambulance is reserved first, then the old one is released.
export async function overrideAssign(caseId, hospitalId, ambulanceId) {
  if (!isObjectId(caseId) || !isObjectId(ambulanceId)) throw httpError(400, 'caseId and ambulanceId must be valid ids');
  const c = await caseRepo.getCase(caseId);
  if (!c) throw httpError(404, 'Emergency case not found');
  if (String(c.hospital) !== String(hospitalId)) throw httpError(403, 'Only the accepting hospital can assign an ambulance');
  if (c.status !== 'accepted') throw httpError(409, 'The ambulance can only be changed before dispatch');

  const target = await ambulanceRepo.getAmbulance(ambulanceId);
  if (!target) throw httpError(404, 'Ambulance not found');
  if (String(target.homeHospital) !== String(hospitalId)) throw httpError(403, 'This ambulance belongs to another hospital');
  if (c.ambulance && String(c.ambulance) === String(ambulanceId)) return { assigned: true, ambulanceId, unchanged: true };

  const claimed = await ambulanceRepo.claimAmbulance(ambulanceId, caseId, hospitalId);
  if (!claimed) throw httpError(409, 'That ambulance is not available right now');

  const updated = await tripRepo.assignAmbulanceToCase(caseId, hospitalId, ambulanceId);
  if (!updated) {
    await ambulanceRepo.releaseAmbulance(ambulanceId, caseId);
    throw httpError(409, 'The case changed while assigning');
  }
  if (c.ambulance) await ambulanceRepo.releaseAmbulance(c.ambulance, caseId);
  await caseRepo.pushTimeline(caseId, { event: 'ambulance_overridden', hospital: hospitalId, detail: target.vehicleNumber, at: new Date() });
  return { assigned: true, ambulanceId: String(ambulanceId) };
}

// What the assignment panel shows: the reserved ambulance and the other free ones, nearest first.
export async function assignmentOptions(caseId, hospitalId) {
  if (!isObjectId(caseId)) throw httpError(400, 'Invalid case id');
  const c = await caseRepo.getCase(caseId);
  if (!c) throw httpError(404, 'Emergency case not found');
  if (String(c.hospital) !== String(hospitalId)) throw httpError(403, 'Only the accepting hospital can see assignment options');

  const point = casePoint(c);
  const free = rankAmbulances(await ambulanceRepo.listFreeAmbulances(hospitalId), point);
  let assigned = null;
  if (c.ambulance) {
    const a = await ambulanceRepo.getAmbulance(c.ambulance);
    if (a) assigned = { ...ambulanceView(a), distanceKm: rankAmbulances([a], point)[0].distanceKm };
  }
  return {
    caseId: String(c._id),
    status: c.status,
    assigned,
    candidates: free.map((a) => ({ ...ambulanceView(a), distanceKm: a.distanceKm })),
  };
}
