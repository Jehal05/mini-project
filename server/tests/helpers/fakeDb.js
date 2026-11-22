// In-memory stand-ins for services/caseRepo.js and services/alternatives.js, used by the Phase 9 tests.
// Every "update if" function checks and changes the case in ONE synchronous step, exactly like a
// single-document MongoDB findOneAndUpdate, so concurrent requests behave the same way.
// (This tests our logic. MongoDB's own atomicity is what makes it safe in production.)
import { pickNextHospital } from '../../src/services/pickNext.js';
import { env } from '../../src/config/env.js';

export const oid = (n) => n.toString(16).padStart(24, '0');
const clone = (v) => (v == null ? v : structuredClone(v));
const sid = String;
export const ACTIVE_STATUSES = ['accepted', 'ambulance_assigned', 'en_route', 'arrived'];
export const MILESTONE_FIELDS = { firstMedicalContact: 'firstMedicalContactAt', treatmentStarted: 'treatmentStartedAt' };

export const db = {};
export function resetDb() {
  db.cases = new Map();
  db.patients = new Map();
  db.hospitals = new Map();
  db.doctors = new Map();
  db.vitals = [];
  db.audit = [];
  db.subs = [];
  db.ranking = []; // hospital ids, best first (what ranking would return for any case)
  db.patients.set(oid(500), { _id: oid(500), fullName: 'Rahul Sharma (demo)', phone: '0000000000', address: 'Pune' });
  for (const n of [1, 2, 3, 4]) db.hospitals.set(oid(n), { _id: oid(n), name: `Hospital ${n}` });
  db.ranking = [oid(1), oid(2), oid(3), oid(4)];
  db.vitals.push({ patient: oid(500), heartRate: 128, systolic: 88, diastolic: 56, spo2: 90, recordedAt: new Date() });
}

let caseCounter = 100;
export function seedCase(over = {}) {
  const id = oid(++caseCounter);
  const c = {
    _id: id, patient: oid(500), status: 'pending', severity: 'critical', riskScore: 80,
    location: { type: 'Point', coordinates: [73.9, 18.5] },
    detectedAt: new Date(), notifiedHospitals: [], rejectedHospitals: [], timedOutHospitals: [],
    candidateHospitals: [], timeline: [], preparation: {}, allHospitalsBusy: false, ...over,
  };
  db.cases.set(id, c);
  return id;
}
export const stored = (id) => db.cases.get(id);

const wasNotified = (c, h) => c.notifiedHospitals.some((n) => sid(n.hospital) === sid(h));
const has = (list, h) => list.some((x) => sid(x) === sid(h));

// ---------- caseRepo ----------
export const getCase = async (id) => clone(db.cases.get(sid(id)));
export const getPatient = async (id) => clone(db.patients.get(sid(id)));
export const getHospital = async (id) => clone(db.hospitals.get(sid(id)));
export const getDoctor = async (id) => clone(db.doctors.get(sid(id)));
export const listDoctors = async (hid) => [...db.doctors.values()].filter((d) => sid(d.hospital) === sid(hid)).map(clone);
export const latestVitals = async (pid) => clone([...db.vitals].reverse().find((v) => sid(v.patient) === sid(pid)));

export const pushTimeline = async (id, entry) => { db.cases.get(sid(id)).timeline.push({ ...entry }); };
export const setAlertedAt = async (id, at) => { const c = db.cases.get(sid(id)); if (!c.alertedAt) c.alertedAt = at; };

export const acceptIfPending = async (id, hid, now) => {
  const c = db.cases.get(sid(id));
  if (!c || c.status !== 'pending' || !wasNotified(c, hid) || has(c.rejectedHospitals, hid)) return null;
  Object.assign(c, { status: 'accepted', hospital: hid, acceptedAt: now });
  c.timeline.push({ event: 'accepted', hospital: hid, at: now });
  return clone(c);
};

export const rejectIfPending = async (id, hid, reason, now) => {
  const c = db.cases.get(sid(id));
  if (!c || c.status !== 'pending' || !wasNotified(c, hid) || has(c.rejectedHospitals, hid)) return null;
  c.rejectedHospitals.push(hid);
  c.timeline.push({ event: 'rejected', hospital: hid, detail: reason, at: now });
  return clone(c);
};

const openFor = (c, hid) => c && sid(c.hospital) === sid(hid) && ACTIVE_STATUSES.includes(c.status);

export const setDoctor = async (id, hid, did, now) => {
  const c = db.cases.get(sid(id));
  if (!openFor(c, hid)) return null;
  c.doctor = did;
  c.timeline.push({ event: 'doctor_assigned', hospital: hid, detail: sid(did), at: now });
  return clone(c);
};

export const setPreparation = async (id, hid, item, done, now) => {
  const c = db.cases.get(sid(id));
  if (!openFor(c, hid)) return null;
  c.preparation[item] = { done, at: now };
  c.timeline.push({ event: `${item}_${done ? 'done' : 'undone'}`, hospital: hid, at: now });
  return clone(c);
};

export const setMilestone = async (id, hid, name, now) => {
  const c = db.cases.get(sid(id));
  const field = MILESTONE_FIELDS[name];
  if (!openFor(c, hid) || c[field]) return null;
  c[field] = now;
  c.timeline.push({ event: name, hospital: hid, at: now });
  return clone(c);
};

export const addTimedOut = async (id, hid, now) => {
  const c = db.cases.get(sid(id));
  if (!c || c.status !== 'pending' || has(c.timedOutHospitals, hid)) return false;
  c.timedOutHospitals.push(hid);
  c.timeline.push({ event: 'no_answer', hospital: hid, at: now });
  return true;
};

export const markAllBusy = async (id, now) => {
  const c = db.cases.get(sid(id));
  if (!c || c.status !== 'pending' || c.allHospitalsBusy) return false;
  c.allHospitalsBusy = true;
  c.timeline.push({ event: 'all_hospitals_busy', at: now });
  return true;
};

export const listForHospital = async (hid) =>
  [...db.cases.values()]
    .filter(
      (c) =>
        (c.status === 'pending' && wasNotified(c, hid) && !has(c.rejectedHospitals, hid)) ||
        (sid(c.hospital) === sid(hid) && ACTIVE_STATUSES.includes(c.status)),
    )
    .map(clone);

export const listPendingForSweep = async () =>
  [...db.cases.values()].filter((c) => c.status === 'pending' && !c.allHospitalsBusy && c.notifiedHospitals.length > 0).map(clone);

export const writeAudit = async (entry) => { db.audit.push({ ...entry }); };
export const listSubscriptions = async (hid) => db.subs.filter((s) => sid(s.hospital) === sid(hid));
export const saveSubscription = async (hid, s) => { db.subs.push({ hospital: hid, ...s }); };
export const removeSubscription = async (endpoint) => { db.subs = db.subs.filter((s) => s.endpoint !== endpoint); };
export const createDemoEmergency = async () => ({ caseId: seedCase(), patientId: oid(500) });

// ---------- alternatives (Phase 8 service the notifications use) ----------
export const prepareCandidates = async (id) => {
  const c = db.cases.get(sid(id));
  c.candidateHospitals = [...db.ranking];
  return db.ranking.map((hid, i) => ({ id: hid, notifyFirst: i < 3 }));
};

export const markNotified = async (id, hid) => {
  const c = db.cases.get(sid(id));
  if (!wasNotified(c, hid)) c.notifiedHospitals.push({ hospital: hid, notifiedAt: new Date() });
};

export const nextHospital = async (id, { now } = {}) => {
  const c = db.cases.get(sid(id));
  if (c.status !== 'pending') return { next: null, unresponsive: [], pending: [], exhausted: false };
  return pickNextHospital({
    candidates: c.candidateHospitals,
    rejected: c.rejectedHospitals,
    notified: c.notifiedHospitals,
    now,
    timeoutMs: env.noAnswerTimeoutSeconds * 1000,
  });
};
