import { describe, it, expect } from 'vitest';
import { computeGoldenHour } from '../src/services/goldenHour.js';
import { findNewTimeouts } from '../src/services/noAnswer.js';
import { serializeCase } from '../src/services/caseView.js';
import { prioritizeCases } from '../src/services/priority.js';

const T0 = new Date('2026-11-22T10:00:00Z').getTime();
const min = (n) => new Date(T0 + n * 60000);

describe('computeGoldenHour (feature 105)', () => {
  it('returns three stages, all not started for a fresh case', () => {
    const stages = computeGoldenHour({}, T0);
    expect(stages.map((s) => s.key)).toEqual(['cathLabAlert', 'ambulanceScene', 'contactToTreatment']);
    expect(stages.every((s) => s.status === 'not_started' && s.overdue === false)).toBe(true);
    expect(stages.map((s) => s.targetMin)).toEqual([30, 10, 90]);
  });

  it('runs the cath lab clock from the first alert and flags overdue after 30 minutes', () => {
    const c = { alertedAt: min(0) };
    const at20 = computeGoldenHour(c, T0 + 20 * 60000)[0];
    expect(at20).toMatchObject({ status: 'running', elapsedMin: 20, overdue: false });
    const at35 = computeGoldenHour(c, T0 + 35 * 60000)[0];
    expect(at35).toMatchObject({ status: 'running', elapsedMin: 35, overdue: true });
  });

  it('stops the cath lab clock when the team is alerted, and keeps the elapsed time', () => {
    const c = { alertedAt: min(0), preparation: { cathLabTeamAlerted: { done: true, at: min(12) } } };
    const s = computeGoldenHour(c, T0 + 200 * 60000)[0];
    expect(s).toMatchObject({ status: 'done', elapsedMin: 12, overdue: false });
  });

  it('keeps running if the cath lab checkbox was un-ticked', () => {
    const c = { alertedAt: min(0), preparation: { cathLabTeamAlerted: { done: false, at: min(5) } } };
    expect(computeGoldenHour(c, T0 + 40 * 60000)[0].status).toBe('running');
  });

  it('measures ambulance scene time against 10 minutes', () => {
    const slow = computeGoldenHour({ ambulanceAtPatientAt: min(0), patientOnBoardAt: min(14) }, T0)[1];
    expect(slow).toMatchObject({ status: 'done', elapsedMin: 14, overdue: true });
    const ok = computeGoldenHour({ ambulanceAtPatientAt: min(0), patientOnBoardAt: min(8) }, T0)[1];
    expect(ok.overdue).toBe(false);
  });

  it('measures first contact to treatment against 90 minutes', () => {
    const s = computeGoldenHour({ firstMedicalContactAt: min(0), treatmentStartedAt: min(95) }, T0)[2];
    expect(s).toMatchObject({ elapsedMin: 95, overdue: true });
  });

  it('stops a running stage when the case closes', () => {
    const s = computeGoldenHour({ alertedAt: min(0), closedAt: min(10) }, T0 + 500 * 60000)[0];
    expect(s).toMatchObject({ status: 'stopped', elapsedMin: 10, overdue: false });
  });
});

describe('findNewTimeouts (no-answer sweep logic)', () => {
  const timeoutMs = 120000;
  const notified = (h, offsetMs) => ({ hospital: h, notifiedAt: new Date(T0 + offsetMs) });

  it('ignores hospitals still inside the timeout', () => {
    expect(findNewTimeouts({ notified: [notified('a', 0)], now: T0 + 60000, timeoutMs })).toEqual([]);
  });

  it('returns hospitals past the timeout', () => {
    expect(findNewTimeouts({ notified: [notified('a', 0), notified('b', 100000)], now: T0 + 130000, timeoutMs })).toEqual(['a']);
  });

  it('skips hospitals that rejected or were already handled (idempotent)', () => {
    const base = { notified: [notified('a', 0), notified('b', 0), notified('c', 0)], now: T0 + 999999, timeoutMs };
    expect(findNewTimeouts({ ...base, rejected: ['a'], timedOut: ['b'] })).toEqual(['c']);
    expect(findNewTimeouts({ ...base, rejected: ['a'], timedOut: ['b', 'c'] })).toEqual([]);
  });

  it('works with ObjectId-like values', () => {
    const oidLike = (s) => ({ toString: () => s });
    expect(findNewTimeouts({ notified: [{ hospital: oidLike('a'), notifiedAt: new Date(T0) }], timedOut: [oidLike('a')], now: T0 + 999999, timeoutMs })).toEqual([]);
  });
});

describe('queue ordering and serialising (features 62, 64)', () => {
  const c = (id, severity, riskScore, detectedMin) => ({ _id: id, severity, riskScore, detectedAt: min(detectedMin) });

  it('orders by severity, then risk score, then longest waiting', () => {
    const sorted = prioritizeCases([c('a', 'high', 90, 0), c('b', 'critical', 50, 5), c('c', 'critical', 50, 1), c('d', 'critical', 70, 9)], { now: min(10).getTime() });
    expect(sorted.map((x) => x.case._id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('adds a response deadline only for a pending case this hospital was notified about', () => {
    const base = { _id: 'x', patient: 'p', severity: 'critical', status: 'pending', notifiedHospitals: [{ hospital: 'h1', notifiedAt: min(0) }] };
    const mine = serializeCase(base, { hospitalId: 'h1', timeoutMs: 120000 });
    expect(mine.respondBy).toBe(min(2).toISOString());
    expect(serializeCase(base, { hospitalId: 'h2', timeoutMs: 120000 }).respondBy).toBeNull();
    expect(serializeCase({ ...base, status: 'accepted' }, { hospitalId: 'h1', timeoutMs: 120000 }).respondBy).toBeNull();
  });

  it('includes severity, risk score and the latest vitals', () => {
    const out = serializeCase(
      { _id: 'x', patient: 'p', severity: 'high', riskScore: 72, status: 'pending', notifiedHospitals: [] },
      { hospitalId: 'h1', timeoutMs: 1, latestVitals: { heartRate: 130, spo2: 91 } },
    );
    expect(out).toMatchObject({ severity: 'high', riskScore: 72, latestVitals: { heartRate: 130, spo2: 91 } });
    expect(out.preparation.edBayReady).toEqual({ done: false, at: null });
  });
});
