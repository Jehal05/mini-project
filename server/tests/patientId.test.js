import { describe, expect, it } from 'vitest';
import { generatePatientId } from '../src/utils/patientId.js';

describe('feature 10: unique patient ID', () => {
  it('uses the HT-YYYY-NNNN format and counts up', async () => {
    const year = new Date().getFullYear();
    expect(await generatePatientId()).toBe(`HT-${year}-0001`);
    expect(await generatePatientId()).toBe(`HT-${year}-0002`);
  });

  it('never repeats an ID when many sign-ups happen at once', async () => {
    const ids = await Promise.all(Array.from({ length: 40 }, () => generatePatientId()));
    expect(new Set(ids).size).toBe(40);
    expect(ids.every((id) => /^HT-\d{4}-\d{4}$/.test(id))).toBe(true);
  });

  it('keeps a separate sequence per year', async () => {
    expect(await generatePatientId(new Date('2030-06-01'))).toBe('HT-2030-0001');
    expect(await generatePatientId(new Date('2031-06-01'))).toBe('HT-2031-0001');
    expect(await generatePatientId(new Date('2030-07-01'))).toBe('HT-2030-0002');
  });
});
