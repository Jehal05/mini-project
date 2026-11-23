import { describe, it, expect } from 'vitest';
import { EMPTY_LIVE, HISTORY_LEN, LEVEL_WORD, applyVitals, levelOf, sourceNote, uiStatus } from './liveVitals.js';

const msg = (hr, extra = {}) => ({ patientId: 'p1', at: '2026-11-23T10:00:00Z', vitals: { hr, sys: 120, dia: 80, spo2: 98, temp: 36.8, rr: 15 }, statuses: { hr: 'normal' }, scenario: 'stable', ...extra });

describe('live vitals stream', () => {
  it('takes the newest reading and keeps only the last 24 heart rates', () => {
    let s = EMPTY_LIVE;
    for (let i = 0; i < 30; i += 1) s = applyVitals(s, msg(60 + i));
    expect(s.bpm).toBe(89);
    expect(s.history).toHaveLength(HISTORY_LEN);
    expect(s.history[0]).toBe(66);
    expect(s.vitals.spo2).toBe(98);
    expect(s.scenario).toBe('stable');
  });
  it('rounds the heart rate and ignores a message without one', () => {
    expect(applyVitals(EMPTY_LIVE, msg(71.6)).bpm).toBe(72);
    const s = applyVitals(EMPTY_LIVE, msg(70));
    expect(applyVitals(s, { vitals: {} })).toBe(s);
    expect(applyVitals(s, null)).toBe(s);
    expect(applyVitals(s, msg(NaN))).toBe(s);
  });
  it('words the detection level and survives a missing or odd one', () => {
    expect(levelOf({ level: 3 })).toBe(3);
    expect(levelOf(null)).toBe(0);
    expect(levelOf({ level: 9 })).toBe(0);
    expect(LEVEL_WORD[3]).toBe('Critical');
  });
  it('maps statuses and says where the readings come from', () => {
    expect(uiStatus('critical')).toBe('critical');
    expect(uiStatus('???')).toBe('unknown');
    expect(sourceNote('server')).toMatch(/Simulated/);
    expect(sourceNote('browser')).toMatch(/browser/);
  });
});
