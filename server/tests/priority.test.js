import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { prioritizeCases, scoreCase, sortNewest, configFromEnv, DEFAULT_CONFIG, pointOf } from '../src/services/priority.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('../../shared/priority-fixtures.json', import.meta.url), 'utf8'));
const ctx = { origin: fixtures.origin, now: new Date(fixtures.now).getTime(), config: fixtures.config };
const ids = (list) => list.map((x) => x.case.id);

describe('feature 95: priority ordering', () => {
  it('matches the shared fixtures (the client test uses the same file)', () => {
    const out = prioritizeCases(fixtures.cases, ctx);
    expect(ids(out)).toEqual(fixtures.expectedOrder);
    for (const x of out) expect(x.priority.priorityScore).toBeCloseTo(fixtures.expectedScores[x.case.id], 2);
  });

  it('severity is a hard tier: a high case with risk 99 and a long wait never outranks any critical case', () => {
    const order = ids(prioritizeCases(fixtures.cases, ctx));
    const lastCritical = Math.max(...fixtures.cases.filter((c) => c.severity === 'critical').map((c) => order.indexOf(c.id)));
    expect(order.indexOf('c2')).toBeGreaterThan(lastCritical);
    expect(order.at(-1)).toBe('c7'); // low severity is last even with risk 100
  });

  it('a critical case with no data at all still stays above every non-critical case', () => {
    const order = ids(prioritizeCases(fixtures.cases, ctx));
    expect(order.indexOf('c3')).toBeLessThan(order.indexOf('c2'));
  });

  it('is deterministic: ties go to the earlier detection, then the id, whatever the input order', () => {
    const a = ids(prioritizeCases(fixtures.cases, ctx));
    const b = ids(prioritizeCases([...fixtures.cases].reverse(), ctx));
    expect(b).toEqual(a);
    expect(a.indexOf('c1')).toBeLessThan(a.indexOf('c4'));
  });

  it('does not crash on missing data and explains each factor', () => {
    const p = scoreCase({ severity: 'critical' }, ctx);
    expect(p).toMatchObject({ tier: 4, priorityScore: 0, factors: { risk: 0, wait: 0, distance: 0 }, distanceKm: null });
    expect(scoreCase({ severity: 'weird', riskScore: 'abc', detectedAt: 'not a date' }, ctx).tier).toBe(0);
  });

  it('waiting longer raises the score, but only up to the cap', () => {
    const base = { severity: 'high', riskScore: 50 };
    const at = (min) => scoreCase({ ...base, detectedAt: new Date(ctx.now - min * 60000).toISOString() }, { ...ctx, origin: null }).priorityScore;
    expect(at(10)).toBeGreaterThan(at(1));
    expect(at(30)).toBe(at(300));
  });

  it('nearer cases score higher, and both location shapes work', () => {
    const near = scoreCase({ severity: 'high', location: { coordinates: [73.861, 18.521] } }, ctx);
    const far = scoreCase({ severity: 'high', location: { lat: 18.75, lng: 73.86 } }, ctx);
    expect(near.priorityScore).toBeGreaterThan(far.priorityScore);
    expect(pointOf({ location: { coordinates: [73.9, 18.5] } })).toEqual({ lat: 18.5, lng: 73.9 });
    expect(pointOf({})).toBeNull();
  });

  it('weights come from the environment, are normalised, and fall back when invalid', () => {
    expect(configFromEnv('5,3,2').weights).toEqual({ risk: 0.5, wait: 0.3, distance: 0.2 });
    expect(configFromEnv('1,0,0').weights.risk).toBe(1);
    expect(configFromEnv('nonsense').weights).toEqual(DEFAULT_CONFIG.weights);
    expect(configFromEnv('0,0,0').weights).toEqual(DEFAULT_CONFIG.weights);
  });

  it('sortNewest puts the latest detection first', () => {
    expect(sortNewest(fixtures.cases).map((c) => c.id)[0]).toBe('c6');
  });
});
