import { describe, it, expect } from 'vitest';
import { timingRows, reasonRows, reasonLabel, cell, hasData, dateInput, MASK_TEXT } from './analyticsView.js';

describe('analyticsView', () => {
  it('keeps masked timings as null with a flag', () => {
    const rows = timingRows({ toAccept: { n: 20, median: 1.5, p90: 3.3 }, toDispatch: { masked: true, n: null, median: null, p90: null } });
    expect(rows[0]).toMatchObject({ name: 'To hospital accept', median: 1.5, p90: 3.3, masked: false });
    expect(rows[1]).toMatchObject({ median: null, masked: true });
    expect(rows[3]).toMatchObject({ median: null, masked: false }); // missing entirely = no data, not masked
  });
  it('labels reasons', () => {
    expect(reasonLabel('no_answer')).toBe('No answer');
    expect(reasonLabel('cath_lab_busy')).toBe('Cath lab busy');
    expect(reasonRows([{ reason: 'no_beds', count: 4, masked: false }])).toEqual([{ name: 'No beds', count: 4, masked: false }]);
  });
  it('formats cells honestly', () => {
    expect(cell(5, false, ' min')).toBe('5 min');
    expect(cell(null, true)).toBe(MASK_TEXT);
    expect(cell(null, false)).toBe('–');
    expect(cell(0, false)).toBe('0');
  });
  it('detects an empty summary and builds date inputs', () => {
    expect(hasData(null)).toBe(false);
    expect(hasData({ totals: { cases: 0 } })).toBe(false);
    expect(hasData({ totals: { cases: 3 } })).toBe(true);
    expect(dateInput(30, new Date('2026-11-23T10:00:00Z'))).toBe('2026-10-24');
  });
});
