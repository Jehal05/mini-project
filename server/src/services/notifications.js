// Hospital notification (features 61, 66 follow-up, 60 no-answer handling).
// Daksh's case creation should call: await notifyHospitals(caseId)
import { env } from '../config/env.js';
import { EVENTS } from '../sockets/events.js';
import { emitToHospital, emitToCase, emitToPatient } from '../sockets/index.js';
import { prepareCandidates, markNotified, nextHospital } from './alternatives.js';
import * as repo from './caseRepo.js';
import { pushToHospital } from './push.js';
import { serializeCase } from './caseView.js';
import { findNewTimeouts } from './noAnswer.js';
import { pickNextHospital } from './pickNext.js';

const timeoutMs = () => env.noAnswerTimeoutSeconds * 1000;

// Socket problems must never break a medical workflow.
export function safeEmit(fn, ...args) {
  try {
    fn(...args);
  } catch (err) {
    console.warn('[socket] emit skipped:', err.message);
  }
}

export async function buildCasePayload(c, hospitalId, now = Date.now()) {
  const [patient, latestVitals] = await Promise.all([repo.getPatient(c.patient), repo.latestVitals(c.patient)]);
  return serializeCase(c, { hospitalId, patient, latestVitals, timeoutMs: timeoutMs(), now });
}

// Notify one hospital: socket alert to its room, record it, add to the timeline, send web push.
export async function notifyOne(caseId, hospitalId) {
  const now = new Date();
  await markNotified(caseId, hospitalId);
  await repo.setAlertedAt(caseId, now);
  await repo.pushTimeline(caseId, { event: 'hospital_notified', hospital: hospitalId, at: now });

  const fresh = await repo.getCase(caseId);
  const payload = await buildCasePayload(fresh, hospitalId, now.getTime());
  safeEmit(emitToHospital, hospitalId, EVENTS.HOSPITAL_ALERT, payload);
  await pushToHospital(hospitalId, {
    title: `${fresh.severity === 'critical' ? 'CRITICAL ' : ''}cardiac emergency`,
    body: 'A new emergency needs your response.',
    caseId: String(caseId),
  });
  return payload;
}

function emitAllBusy(c) {
  const payload = {
    caseId: String(c._id),
    allHospitalsBusy: true,
    message: 'All nearby hospitals are busy. Call 112 or 108 now.',
  };
  safeEmit(emitToCase, c._id, EVENTS.EMERGENCY_REJECTED, payload);
  safeEmit(emitToPatient, c.patient, EVENTS.EMERGENCY_REJECTED, payload);
}

// Feature 61: rank hospitals for the case and alert the top 3.
export async function notifyHospitals(caseId, { radiusKm } = {}) {
  const c = await repo.getCase(caseId);
  if (!c) throw Object.assign(new Error('Emergency case not found'), { status: 404 });
  if (!c.timeline?.length) await repo.pushTimeline(caseId, { event: 'detected', at: c.detectedAt || new Date() });

  const ranked = await prepareCandidates(caseId, radiusKm ? { radiusKm } : undefined);
  const top = ranked.filter((r) => r.notifyFirst);

  if (!top.length) {
    if (await repo.markAllBusy(caseId, new Date())) emitAllBusy(await repo.getCase(caseId));
    return { notified: [], allHospitalsBusy: true };
  }
  for (const h of top) await notifyOne(caseId, h.id);
  return { notified: top.map((h) => h.id), allHospitalsBusy: false };
}

// Phase 7 (feature 45): nobody accepted in the last round, so look again in a wider circle and alert up to 3 hospitals
// that were not tried yet. Hospitals that already rejected or were notified are skipped. Safe to call again for the same round.
export async function widenSearch(caseId, { radiusKm, limit = 3 } = {}) {
  let c = await repo.getCase(caseId);
  if (!c) throw Object.assign(new Error('Emergency case not found'), { status: 404 });
  if (c.status !== 'pending') return { notified: [], skipped: `case is ${c.status}` };
  await repo.clearAllBusy(caseId);
  await prepareCandidates(caseId, { radiusKm });
  const notified = [];
  for (let i = 0; i < limit; i += 1) {
    c = await repo.getCase(caseId);
    if (!c || c.status !== 'pending') break;
    const { next } = pickNextHospital({ candidates: c.candidateHospitals, rejected: c.rejectedHospitals, notified: c.notifiedHospitals, timeoutMs: timeoutMs() });
    if (!next) break;
    await notifyOne(caseId, next);
    notified.push(String(next));
  }
  if (!notified.length) {
    c = await repo.getCase(caseId);
    const waiting = (c?.notifiedHospitals ?? []).some((n) => !(c.rejectedHospitals ?? []).some((r) => String(r) === String(n.hospital)));
    if (c?.status === 'pending' && !waiting && (await repo.markAllBusy(caseId, new Date()))) emitAllBusy(await repo.getCase(caseId));
  }
  return { notified };
}

// Moves a case to its next hospital (after a rejection or a no-answer). Safe to call repeatedly.
export async function advanceToNextHospital(caseId) {
  const r = await nextHospital(caseId);
  if (r.next) {
    await notifyOne(caseId, r.next);
    return { notified: r.next };
  }
  if (r.exhausted) {
    if (await repo.markAllBusy(caseId, new Date())) emitAllBusy(await repo.getCase(caseId));
    return { allHospitalsBusy: true };
  }
  return { waiting: true };
}

// One pass of the no-answer check. addTimedOut() succeeds for exactly one caller per hospital,
// so running the sweep twice, or from two server processes, never notifies the same next hospital twice.
export async function runNoAnswerSweep({ now = Date.now() } = {}) {
  const cases = await repo.listPendingForSweep();
  let handled = 0;
  for (const c of cases) {
    try {
      const late = findNewTimeouts({
        notified: c.notifiedHospitals,
        rejected: c.rejectedHospitals,
        timedOut: c.timedOutHospitals,
        now,
        timeoutMs: timeoutMs(),
      });
      for (const hospitalId of late) {
        if (await repo.addTimedOut(c._id, hospitalId, new Date(now))) {
          handled += 1;
          await advanceToNextHospital(c._id);
        }
      }
    } catch (err) {
      console.error('[sweep] case', String(c._id), 'failed:', err.message);
    }
  }
  return { checked: cases.length, handled };
}

export function startNoAnswerScheduler({ intervalSeconds = env.sweepIntervalSeconds } = {}) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap two sweeps in one process
    running = true;
    try {
      await runNoAnswerSweep();
    } finally {
      running = false;
    }
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
