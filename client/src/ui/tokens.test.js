import { describe, it, expect } from 'vitest';
import { severityMeta, toneClasses, statusMeta, fleetMeta, SEVERITIES } from './tokens.js';
import { classifyVital, overallVitals } from './vitals.js';
import { resolveTheme, loadTheme, saveTheme, toggleTheme } from './theme.js';
import { navFor, defaultView, isValidView, pageTitle, showsCallBar, ROLES } from './roles.js';
import { patientStep, PATIENT_STEPS } from '../lib/patientStages.js';
import { appendReading, seriesOf } from '../lib/vitalsTrend.js';

describe('severity and status helpers', () => {
  it('gives every severity a word, a shape and a tone, never colour alone', () => {
    const shapes = new Set(SEVERITIES.map((s) => severityMeta(s).icon));
    expect(shapes.size).toBe(4);
    for (const s of SEVERITIES) expect(severityMeta(s).label.length).toBeGreaterThan(2);
    expect(severityMeta('critical').rank).toBeGreaterThan(severityMeta('high').rank);
    expect(severityMeta('weird')).toMatchObject({ label: 'Unknown', tone: 'neutral', rank: 0 });
  });
  it('maps tones to class names and falls back safely', () => {
    expect(toneClasses('critical').solid).toContain('bg-critical');
    expect(toneClasses('nope')).toBe(toneClasses('neutral'));
  });
  it('describes case and fleet status in plain words', () => {
    expect(statusMeta('pending').label).toBe('Waiting for a hospital');
    expect(statusMeta('some_new_status').label).toBe('some new status');
    expect(fleetMeta('on_trip').label).toBe('On a trip');
  });
});

describe('vitals classification (simulated ranges)', () => {
  it('classifies heart rate, pressure and oxygen', () => {
    expect(classifyVital('heartRate', 72)).toBe('normal');
    expect(classifyVital('heartRate', 110)).toBe('warning');
    expect(classifyVital('heartRate', 130)).toBe('critical');
    expect(classifyVital('heartRate', 40)).toBe('critical');
    expect(classifyVital('spo2', 97)).toBe('normal');
    expect(classifyVital('spo2', 92)).toBe('warning');
    expect(classifyVital('spo2', 88)).toBe('critical');
    expect(classifyVital('systolic', 85)).toBe('critical');
  });
  it('treats missing or bad values as unknown, and reports the worst reading overall', () => {
    expect(classifyVital('heartRate', null)).toBe('unknown');
    expect(classifyVital('heartRate', 'abc')).toBe('unknown');
    expect(classifyVital('nothing', 5)).toBe('unknown');
    expect(overallVitals(null)).toBe('unknown');
    expect(overallVitals({ heartRate: 72, spo2: 97 })).toBe('normal');
    expect(overallVitals({ heartRate: 72, spo2: 88 })).toBe('critical');
  });
});

describe('theme persistence', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it('admin and doctor start dark, others follow the device', () => {
    expect(resolveTheme({ role: 'admin', stored: null, systemDark: false })).toBe('dark');
    expect(resolveTheme({ role: 'doctor', stored: null })).toBe('dark');
    expect(resolveTheme({ role: 'patient', stored: null, systemDark: false })).toBe('light');
    expect(resolveTheme({ role: 'patient', stored: null, systemDark: true })).toBe('dark');
  });
  it('a saved choice wins, per role', () => {
    const s = mem();
    expect(saveTheme(s, 'admin', 'light')).toBe(true);
    expect(loadTheme(s, 'admin')).toBe('light');
    expect(loadTheme(s, 'doctor')).toBeNull();
    expect(resolveTheme({ role: 'admin', stored: loadTheme(s, 'admin') })).toBe('light');
    expect(toggleTheme('light')).toBe('dark');
  });
  it('survives a broken or missing storage', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(loadTheme(broken, 'admin')).toBeNull();
    expect(saveTheme(broken, 'admin', 'dark')).toBe(false);
    expect(loadTheme(undefined, 'admin')).toBeNull();
  });
});

describe('roles and navigation', () => {
  it('every role has screens, a default view and valid titles', () => {
    for (const r of ROLES) {
      expect(navFor(r.id).length).toBeGreaterThan(0);
      expect(isValidView(r.id, defaultView(r.id))).toBe(true);
      expect(pageTitle(r.id, defaultView(r.id)).length).toBeGreaterThan(2);
    }
  });
  it('keeps roles apart and keeps emergency calls on patient and crew', () => {
    expect(isValidView('patient', 'queue')).toBe(false);
    expect(isValidView('hospital', 'queue')).toBe(true);
    expect(navFor('nobody')).toEqual([]);
    expect(showsCallBar('patient')).toBe(true);
    expect(showsCallBar('crew')).toBe(true);
    expect(showsCallBar('admin')).toBe(false);
  });
});

describe('patient stepper', () => {
  it('maps case status and trip stage to the five steps', () => {
    expect(PATIENT_STEPS).toHaveLength(5);
    expect(patientStep({})).toBe(0);
    expect(patientStep({ caseStatus: 'pending' })).toBe(0);
    expect(patientStep({ caseStatus: 'accepted' })).toBe(1);
    expect(patientStep({ caseStatus: 'ambulance_assigned', tripStage: 'en_route' })).toBe(2);
    expect(patientStep({ tripStage: 'at_patient' })).toBe(2);
    expect(patientStep({ tripStage: 'patient_on_board' })).toBe(3);
    expect(patientStep({ caseStatus: 'en_route' })).toBe(3);
    expect(patientStep({ tripStage: 'at_hospital' })).toBe(4);
    expect(patientStep({ caseStatus: 'closed' })).toBe(4);
  });
});

describe('vitals trend', () => {
  it('keeps a short history, ignores repeats and empty readings', () => {
    let h = [];
    h = appendReading(h, { heartRate: 120, recordedAt: 'a' });
    h = appendReading(h, { heartRate: 120, recordedAt: 'a' });
    h = appendReading(h, null);
    h = appendReading(h, { heartRate: 126, recordedAt: 'b' });
    expect(h).toHaveLength(2);
    expect(seriesOf(h, 'heartRate')).toEqual([120, 126]);
    let many = [];
    for (let i = 0; i < 30; i += 1) many = appendReading(many, { heartRate: i, recordedAt: String(i) }, 20);
    expect(many).toHaveLength(20);
    expect(many[0].heartRate).toBe(10);
  });
});
