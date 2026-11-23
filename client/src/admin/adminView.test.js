import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../../../shared/vitals.js';
import { actionLabel, boundsOf, detail, formFrom, overridesFrom, registrationBody } from './adminView.js';

describe('threshold editor', () => {
  it('sends nothing when nothing changed', () => {
    expect(overridesFrom(formFrom(DEFAULT_THRESHOLDS), DEFAULT_THRESHOLDS)).toEqual({});
  });
  it('sends only the vital that changed', () => {
    const form = formFrom(DEFAULT_THRESHOLDS);
    form.hr.lo = '55'; form.spo2.below = '88';
    expect(overridesFrom(form, DEFAULT_THRESHOLDS)).toEqual({ hr: { normal: [55, 100] }, spo2: { critical: { below: 88 } } });
  });
});
describe('registration body', () => {
  it('drops empty optional fields and converts coordinates', () => {
    const b = registrationBody({ code: 'A', address: '', area: '', phone: '', latitude: '18.5', longitude: '73.8', cathLab: false });
    expect(b).toEqual({ code: 'A', latitude: 18.5, longitude: 73.8, cathLab: false });
    expect(registrationBody({ latitude: '', longitude: '' }).latitude).toBeUndefined();
  });
});
describe('audit view', () => {
  it('words actions and details', () => {
    expect(actionLabel('admin_register_hospital')).toBe('register hospital');
    expect(detail({ resourceRef: 'X1', meta: { name: 'City' } })).toBe('X1 · City');
  });
});
describe('command map', () => {
  it('has no bounds when empty', () => {
    expect(boundsOf({ hospitals: [], ambulances: [], cases: [] })).toBeNull();
    expect(boundsOf({ hospitals: [{ location: { latitude: 1, longitude: 2 } }], ambulances: [], cases: [] })).toEqual([[1, 2]]);
  });
});
