// Hospital response to a case: queue, patient info, accept, reject, doctor, checklist, timeline.
import { env } from '../config/env.js';
import { EVENTS } from '../sockets/events.js';
import { emitToHospital, emitToCase, emitToPatient, emitToDoctor } from '../sockets/index.js';
import * as repo from './caseRepo.js';
import { PREP_ITEMS } from './caseView.js';
import { prioritizeCases, sortNewest, configFromEnv, SORT_MODES } from './priority.js';
import { computeGoldenHour } from './goldenHour.js';
import { buildCasePayload, advanceToNextHospital, safeEmit } from './notifications.js';
import { httpError } from '../utils/httpError.js';
import { isObjectId } from '../utils/ids.js';
import { autoAssignSafely } from './assignment.js';

export const REJECT_REASONS = ['no_beds', 'no_cardiologist', 'cath_lab_busy', 'other'];
const ACTIVE = repo.ACTIVE_STATUSES;
const sid = (v) => String(v);

async function load(caseId) {
  if (!isObjectId(caseId)) throw httpError(400, 'Invalid case id');
  const c = await repo.getCase(caseId);
  if (!c) throw httpError(404, 'Emergency case not found');
  return c;
}
const wasNotified = (c, hospitalId) => (c.notifiedHospitals || []).some((n) => sid(n.hospital) === sid(hospitalId));
const isOwner = (c, hospitalId) => c.hospital && sid(c.hospital) === sid(hospitalId);

function requireInvolved(c, hospitalId) {
  if (!wasNotified(c, hospitalId) && !isOwner(c, hospitalId)) {
    throw httpError(403, 'This hospital was not notified for this case');
  }
}

export async function broadcastCase(caseId, hospitalId) {
  const fresh = await repo.getCase(caseId);
  const payload = await buildCasePayload(fresh, hospitalId);
  safeEmit(emitToCase, caseId, EVENTS.CASE_UPDATE, payload);
  safeEmit(emitToHospital, hospitalId, EVENTS.CASE_UPDATE, payload);
  return payload;
}

// Feature 62
export async function listQueue(hospitalId, { sort = 'priority', now = Date.now() } = {}) {
  if (!SORT_MODES.includes(sort)) throw httpError(400, `sort must be one of: ${SORT_MODES.join(', ')}`);
  const [open, hospital] = await Promise.all([repo.listForHospital(hospitalId), repo.getHospital(hospitalId)]);
  const config = configFromEnv(env.priorityWeights, { waitCapMin: env.priorityWaitCapMin, distanceCapKm: env.priorityDistanceCapKm });
  const origin = hospital?.location?.coordinates ? { lat: hospital.location.coordinates[1], lng: hospital.location.coordinates[0] } : null;

  // Priority is always computed, so the screen can explain the order even when sorted by newest.
  const prioritized = prioritizeCases(open, { origin, now, config });
  const scored = new Map(prioritized.map((x) => [sid(x.case._id), x.priority]));
  const ordered = sort === 'newest' ? sortNewest(open) : prioritized.map((x) => x.case);
  const results = await Promise.all(
    ordered.map(async (c) => ({ ...(await buildCasePayload(c, hospitalId)), priority: { ...scored.get(sid(c._id)), config } })),
  );
  return { count: results.length, sort, results };
}

export async function getCaseDetail(caseId, hospitalId) {
  const c = await load(caseId);
  requireInvolved(c, hospitalId);
  return buildCasePayload(c, hospitalId);
}

// Feature 63: only a notified hospital, only while the case is open, every read is logged.
// Once one hospital accepts, the other notified hospitals lose access.
export async function getPatientInfo(caseId, hospitalId, staff = {}) {
  const c = await load(caseId);
  if (c.status === 'closed') throw httpError(403, 'Access ended when the case closed');
  if (!wasNotified(c, hospitalId)) throw httpError(403, 'This hospital was not notified for this case');
  if (c.status !== 'pending' && !isOwner(c, hospitalId)) throw httpError(403, 'Accepted by another hospital');

  const [patient, vitals] = await Promise.all([repo.getPatient(c.patient), repo.latestVitals(c.patient)]);
  if (!patient) throw httpError(404, 'Patient record not found');

  await repo.writeAudit({
    actor: staff.userId,
    action: 'view_patient_record',
    resourceType: 'EmergencyCase',
    resourceId: c._id,
    meta: { hospital: sid(hospitalId), patient: sid(c.patient) },
  });

  const gap = (key, owner) =>
    patient[key] ?? { available: false, note: `Not available yet: ${owner} builds this part of the patient profile.` };

  const payload = await buildCasePayload(c, hospitalId);
  return {
    caseId: sid(c._id),
    patientId: sid(c.patient),
    passport: { fullName: patient.fullName, dateOfBirth: patient.dateOfBirth ?? null, phone: patient.phone ?? null, address: patient.address ?? null },
    cardiacHistory: gap('cardiacHistory', 'Jehal'),
    allergies: gap('allergies', 'Jehal'),
    medicines: gap('medicines', 'Jehal'),
    symptomAnswers: gap('symptomAnswers', 'Daksh (SOS flow)'),
    twinSnapshot: gap('twinSnapshot', 'Daksh (digital twin)'),
    healthSummary: { severity: c.severity, riskScore: c.riskScore ?? null, latestVitals: payload.latestVitals, detectedAt: payload.detectedAt },
    accessLogged: true,
    notice: 'Simulated data for demonstration. Not a medical device.',
  };
}

// Features 65 and 67: the first hospital to accept wins. The decision is one atomic database update.
export async function acceptCase(caseId, hospitalId) {
  const c = await load(caseId);
  if (!wasNotified(c, hospitalId)) throw httpError(403, 'This hospital was not notified for this case');

  const doc = await repo.acceptIfPending(caseId, hospitalId, new Date());
  if (!doc) {
    // Someone else may have won while we were checking, so look at the case again for the message.
    const now = (await repo.getCase(caseId)) || c;
    if (now.status !== 'pending') {
      throw httpError(409, isOwner(now, hospitalId) ? 'You already accepted this case' : 'Accepted by another hospital');
    }
    throw httpError(409, 'This case can no longer be accepted by your hospital');
  }

  const hospital = await repo.getHospital(hospitalId);
  const message = `${hospital?.name ?? 'A hospital'} accepted your emergency. Ambulance being assigned.`;
  const base = { caseId: sid(doc._id), hospitalId: sid(hospitalId), hospitalName: hospital?.name ?? null };

  safeEmit(emitToCase, doc._id, EVENTS.EMERGENCY_ACCEPTED, { ...base, message, acceptedByAnotherHospital: false });
  safeEmit(emitToPatient, doc.patient, EVENTS.EMERGENCY_ACCEPTED, { ...base, message, acceptedByAnotherHospital: false });
  safeEmit(emitToHospital, hospitalId, EVENTS.EMERGENCY_ACCEPTED, { ...base, acceptedByAnotherHospital: false });
  for (const n of doc.notifiedHospitals) {
    if (sid(n.hospital) !== sid(hospitalId)) {
      safeEmit(emitToHospital, n.hospital, EVENTS.EMERGENCY_ACCEPTED, {
        caseId: base.caseId,
        acceptedByAnotherHospital: true,
        message: 'Accepted by another hospital',
      });
    }
  }
  // Phase 10 (feature 73): reserve the nearest available ambulance. Never blocks or fails the accept.
  await autoAssignSafely(doc._id);
  return buildCasePayload((await repo.getCase(caseId)) || doc, hospitalId);
}

// Feature 66
export async function rejectCase(caseId, hospitalId, reason) {
  if (!REJECT_REASONS.includes(reason)) throw httpError(400, `reason must be one of: ${REJECT_REASONS.join(', ')}`);
  const c = await load(caseId);
  if (!wasNotified(c, hospitalId)) throw httpError(403, 'This hospital was not notified for this case');

  const doc = await repo.rejectIfPending(caseId, hospitalId, reason, new Date());
  if (!doc) throw httpError(409, 'This case is no longer pending, or you already rejected it');

  const payload = { caseId: sid(doc._id), hospitalId: sid(hospitalId), reason };
  safeEmit(emitToHospital, hospitalId, EVENTS.EMERGENCY_REJECTED, payload);
  safeEmit(emitToCase, doc._id, EVENTS.EMERGENCY_REJECTED, payload);
  safeEmit(emitToPatient, doc.patient, EVENTS.EMERGENCY_REJECTED, payload);

  const next = await advanceToNextHospital(caseId);
  return { ok: true, next };
}

// Feature 68
export async function assignDoctor(caseId, hospitalId, doctorId) {
  if (!isObjectId(doctorId)) throw httpError(400, 'doctorId is required');
  const c = await load(caseId);
  if (!isOwner(c, hospitalId) || !ACTIVE.includes(c.status)) {
    throw httpError(403, 'Only the accepting hospital can assign a doctor to an open case');
  }
  const doctor = await repo.getDoctor(doctorId);
  const valid =
    doctor && sid(doctor.hospital) === sid(hospitalId) && doctor.onDuty && ['cardiologist', 'emergency'].includes(doctor.specialty);
  if (!valid) throw httpError(400, 'Choose an on-duty cardiologist or ED doctor from this hospital');

  const doc = await repo.setDoctor(caseId, hospitalId, doctorId, new Date());
  if (!doc) throw httpError(409, 'Case is no longer open');
  safeEmit(emitToDoctor, doctorId, EVENTS.HOSPITAL_ALERT, {
    type: 'doctor_assignment',
    caseId: sid(doc._id),
    doctorId: sid(doctorId),
    message: `${doctor.name}: you have been assigned to a cardiac emergency.`,
  });
  return broadcastCase(caseId, hospitalId);
}

// Feature 69
export async function updatePreparation(caseId, hospitalId, item, done) {
  if (!PREP_ITEMS.includes(item)) throw httpError(400, `item must be one of: ${PREP_ITEMS.join(', ')}`);
  if (typeof done !== 'boolean') throw httpError(400, 'done must be true or false');
  const c = await load(caseId);
  if (!isOwner(c, hospitalId) || !ACTIVE.includes(c.status)) {
    throw httpError(403, 'Only the accepting hospital can update the checklist of an open case');
  }
  const now = new Date();
  const doc = await repo.setPreparation(caseId, hospitalId, item, done, now);
  if (!doc) throw httpError(409, 'Case is no longer open');

  const update = { caseId: sid(doc._id), item, done, at: now.toISOString() };
  safeEmit(emitToCase, doc._id, EVENTS.PREPARATION_UPDATE, update);
  safeEmit(emitToHospital, hospitalId, EVENTS.PREPARATION_UPDATE, update);
  return broadcastCase(caseId, hospitalId);
}

// Feature 105: staff mark first medical contact and start of treatment.
export async function recordMilestone(caseId, hospitalId, name) {
  if (!repo.MILESTONE_FIELDS[name]) throw httpError(400, `name must be one of: ${Object.keys(repo.MILESTONE_FIELDS).join(', ')}`);
  const c = await load(caseId);
  if (!isOwner(c, hospitalId) || !ACTIVE.includes(c.status)) {
    throw httpError(403, 'Only the accepting hospital can record milestones on an open case');
  }
  await repo.setMilestone(caseId, hospitalId, name, new Date()); // already set: nothing changes
  return broadcastCase(caseId, hospitalId);
}

// Feature 70
export async function getTimeline(caseId, hospitalId) {
  const c = await load(caseId);
  requireInvolved(c, hospitalId);
  const timeline = [...(c.timeline || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  return {
    caseId: sid(c._id),
    timeline: timeline.map((t) => ({
      event: t.event,
      at: new Date(t.at).toISOString(),
      hospital: t.hospital ? sid(t.hospital) : null,
      detail: t.detail ?? null,
    })),
    goldenHour: computeGoldenHour(c),
  };
}

export async function listHospitalDoctors(hospitalId) {
  const docs = await repo.listDoctors(hospitalId);
  return docs
    .filter((d) => d.onDuty && ['cardiologist', 'emergency'].includes(d.specialty))
    .map((d) => ({ id: sid(d._id), name: d.name, specialty: d.specialty }));
}

export const noAnswerSeconds = () => env.noAnswerTimeoutSeconds;
