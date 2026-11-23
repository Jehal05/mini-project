import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/auth/authRepo.js', async () => await import('../helpers/fakeAuthRepo.js'));

import { env } from '../../src/config/env.js';
import { signJwt } from '../../src/auth/tokens.js';
import { canAccess, socketAuthorizer } from '../../src/monitoring/auth.js';
import { toSimPatient } from '../../src/monitoring/patientAdapter.js';
import { simCaseLocation, LIVE_STATUSES } from '../../src/monitoring/caseLocation.js';
import { computeBaseline } from '../../src/simulation/baseline.js';
import { patientRoom } from '../../src/simulation/engine.js';
import { store, resetAuth, addUser } from '../helpers/fakeAuthRepo.js';

const P1 = 'a'.repeat(24);
const P2 = 'b'.repeat(24);

describe('patient adapter (our Patient -> the shape the monitoring code reads)', () => {
  it('maps the names and keeps the medical lists', () => {
    const sim = toSimPatient({ _id: P1, patientId: 'HT-2026-0001', fullName: 'Rahul Sharma', dateOfBirth: new Date('1981-01-01'), bloodGroup: 'B+', city: 'Pune', cardiacConditions: [{ type: 'heart_attack' }], medicalConditions: [{ name: 'Hypertension' }], allergies: [{ allergen: 'Penicillin' }], medications: [{ drug: 'Aspirin' }] });
    expect(sim.patientCode).toBe('HT-2026-0001');
    expect(sim.name).toBe('Rahul Sharma');
    expect(sim.allergies).toEqual(['Penicillin']);
    expect(sim.medications).toEqual(['Aspirin']);
  });
  it('lets the baseline code read the conditions (a cardiac, hypertensive patient sits higher than a healthy one)', () => {
    const risky = computeBaseline(toSimPatient({ _id: P1, patientId: 'HT-2026-0001', fullName: 'A', dateOfBirth: new Date('1981-01-01'), cardiacConditions: [{ type: 'stent' }], medicalConditions: [{ name: 'Hypertension' }] }));
    const healthy = computeBaseline(toSimPatient({ _id: P2, patientId: 'HT-2026-0002', fullName: 'B', dateOfBirth: new Date('1981-01-01') }));
    expect(risky.hr).toBeGreaterThan(healthy.hr);
    expect(risky.sys).toBeGreaterThan(healthy.sys);
  });
  it('leaves a missing record missing, so "no allergy known" is never invented', () => {
    expect(toSimPatient({ _id: P1, patientId: 'HT-2026-0001', fullName: 'A' }).allergies).toBeUndefined();
    expect(toSimPatient(null)).toBeNull();
  });
});

describe('who may see which patient (canAccess)', () => {
  const at = (user) => ({ user });
  it('lets a patient see only their own record', () => {
    expect(canAccess(at({ role: 'patient', patientId: P1 }), { _id: P1 })).toBe(true);
    expect(canAccess(at({ role: 'patient', patientId: P1 }), { _id: P2 })).toBe(false);
    expect(canAccess(at({ role: 'patient' }), { _id: P1 })).toBe(false);
  });
  it('lets clinical roles see patients, and nobody else', () => {
    for (const role of ['doctor', 'hospital_staff', 'hospital_admin', 'central_admin']) expect(canAccess(at({ role }), { _id: P1 })).toBe(true);
    expect(canAccess(at({ role: 'ambulance_crew' }), { _id: P1 })).toBe(false);
  });
  it('allows a request with no user only in dev mode', () => {
    expect(canAccess({}, { _id: P1 })).toBe(env.devAuth);
  });
});

describe('vitals:subscribe authorization', () => {
  beforeEach(() => resetAuth());
  const session = (role, patientId) => {
    const u = addUser({ role, isActive: true, patient: patientId });
    store.tokens.push({ _id: 't1', family: 'fam1', user: u._id, tokenHash: 'x' });
    const token = signJwt({ sub: String(u._id), role, fam: 'fam1', patientId }, { secret: env.jwtSecret, ttlSeconds: 600 });
    return { handshake: { auth: { token } } };
  };
  it('lets a patient follow only themselves', async () => {
    const authorize = socketAuthorizer();
    expect(await authorize(session('patient', P1), P1)).toBe(true);
    expect(await authorize(session('patient', P1), P2)).toBe(false);
  });
  it('lets a doctor follow an existing patient, but not a missing one', async () => {
    const authorize = socketAuthorizer({ patientExists: async (id) => id === P1 });
    expect(await authorize(session('doctor'), P1)).toBe(true);
    expect(await authorize(session('doctor'), P2)).toBe(false);
  });
  it('refuses a bad token, and an ended session', async () => {
    const authorize = socketAuthorizer();
    expect(await authorize({ handshake: { auth: { token: 'not-a-token' } } }, P1)).toBe(false);
    const s = session('patient', P1);
    store.tokens.length = 0; // session revoked
    expect(await authorize(s, P1)).toBe(false);
  });
  it('allows a socket without a token only in dev mode', async () => {
    expect(await socketAuthorizer()({ handshake: { auth: {} } }, P1)).toBe(env.devAuth);
  });
});

describe('case placement and rooms', () => {
  it('uses Pune unless a valid location is set, and treats a closed case as not live', () => {
    expect(simCaseLocation({})).toEqual([73.8567, 18.5204]);
    expect(simCaseLocation({ SIM_CASE_LAT: '19.07', SIM_CASE_LNG: '72.87' })).toEqual([72.87, 19.07]);
    expect(simCaseLocation({ SIM_CASE_LAT: '999', SIM_CASE_LNG: '72' })).toEqual([73.8567, 18.5204]);
    expect(LIVE_STATUSES).toContain('pending');
    expect(LIVE_STATUSES.includes('closed')).toBe(false);
  });
  it('keeps live vitals in their own room, apart from the emergency-status room', () => {
    expect(patientRoom('abc')).toBe('vitals:abc');
  });
});
