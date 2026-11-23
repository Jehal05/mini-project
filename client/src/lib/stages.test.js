import { describe, it, expect } from 'vitest';
import { STAGES, stageState, crewAction, formatEta } from './stages.js';

describe('stages', () => {
  it('has the five stages in order', () => {
    expect(STAGES.map((s) => s.key)).toEqual(['en_route', 'at_patient', 'patient_on_board', 'en_route_to_hospital', 'at_hospital']);
  });
  it('marks done, current and upcoming', () => {
    expect(stageState('at_patient', 'en_route')).toBe('done');
    expect(stageState('at_patient', 'at_patient')).toBe('current');
    expect(stageState('at_patient', 'at_hospital')).toBe('upcoming');
    expect(stageState('at_hospital', 'at_hospital')).toBe('done');
  });
  it('only offers crew buttons at pickup and arrival', () => {
    expect(crewAction('at_patient').kind).toBe('pickup');
    expect(crewAction('en_route_to_hospital').kind).toBe('arrive');
    expect(crewAction('en_route').kind).toBe('wait');
    expect(crewAction('at_hospital').kind).toBe('done');
  });
  it('formats ETA', () => {
    expect(formatEta(0.4)).toBe('under 1 min');
    expect(formatEta(4.6)).toBe('5 min');
    expect(formatEta(null)).toBe('–');
  });
});
