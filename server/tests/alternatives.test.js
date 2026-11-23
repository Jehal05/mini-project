import { describe, it, expect } from 'vitest';
import { pickNextHospital } from '../src/services/pickNext.js';

const T0 = new Date('2026-11-22T10:00:00Z').getTime();
const base = { candidates: ['h1', 'h2', 'h3', 'h4', 'h5'], timeoutMs: 120000, now: T0 + 10000 };
const notified = (id, offsetMs = 0) => ({ hospital: id, notifiedAt: new Date(T0 + offsetMs) });

describe('pickNextHospital', () => {
  it('returns the best candidate when nobody has been tried', () => {
    expect(pickNextHospital(base).next).toBe('h1');
  });

  it('skips hospitals already notified or rejected', () => {
    const r = pickNextHospital({ ...base, notified: [notified('h1'), notified('h2')], rejected: ['h1'] });
    expect(r.next).toBe('h3');
  });

  it('reports notified hospitals still inside the timeout as pending', () => {
    const r = pickNextHospital({ ...base, notified: [notified('h1')] });
    expect(r.pending).toEqual(['h1']);
    expect(r.unresponsive).toEqual([]);
  });

  it('marks a notified hospital unresponsive after the timeout', () => {
    const r = pickNextHospital({ ...base, now: T0 + 130000, notified: [notified('h1')] });
    expect(r.unresponsive).toEqual(['h1']);
    expect(r.pending).toEqual([]);
    expect(r.next).toBe('h2');
  });

  it('does not call a rejected hospital unresponsive', () => {
    const r = pickNextHospital({ ...base, now: T0 + 130000, notified: [notified('h1')], rejected: ['h1'] });
    expect(r.unresponsive).toEqual([]);
  });

  it('is exhausted only when every candidate was tried and nobody is still pending', () => {
    const all = ['h1', 'h2'];
    const done = pickNextHospital({ candidates: all, timeoutMs: 1000, now: T0 + 5000, rejected: all, notified: all.map((id) => notified(id)) });
    expect(done.next).toBeNull();
    expect(done.exhausted).toBe(true);

    const waiting = pickNextHospital({ candidates: all, timeoutMs: 100000, now: T0 + 5000, notified: all.map((id) => notified(id)) });
    expect(waiting.next).toBeNull();
    expect(waiting.exhausted).toBe(false);
  });

  it('accepts plain ObjectId-like values', () => {
    const oid = (s) => ({ toString: () => s });
    expect(pickNextHospital({ ...base, candidates: [oid('a'), oid('b')], rejected: [oid('a')] }).next).toBe('b');
  });
});
