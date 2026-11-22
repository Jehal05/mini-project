import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { prioritizeCases, explain } from './priority.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('../../../shared/priority-fixtures.json', import.meta.url), 'utf8'));
const ctx = { origin: fixtures.origin, now: new Date(fixtures.now).getTime(), config: fixtures.config };

describe('client priority mirror', () => {
  it('gives the same order and scores as the server for the shared fixtures', () => {
    const out = prioritizeCases(fixtures.cases, ctx);
    expect(out.map((x) => x.case.id)).toEqual(fixtures.expectedOrder);
    for (const x of out) expect(x.priority.priorityScore).toBeCloseTo(fixtures.expectedScores[x.case.id], 2);
  });
  it('explains an order in words', () => {
    const [first] = prioritizeCases(fixtures.cases, ctx);
    expect(explain(first.priority)).toContain('Severity first');
    expect(explain(null)).toBe('');
  });
});
