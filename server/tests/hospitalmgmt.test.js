import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/hospitalmgmt/repo.js', async () => await import('./helpers/fakeHospitalMgmtRepo.js'));

import * as svc from '../src/hospitalmgmt/service.js';
import { averageResponse, historyFilter, outcomeOf, summariseBeds } from '../src/hospitalmgmt/logic.js';
import { validateBayAction, validateDoctorCreate, validateHistoryQuery, validateProfile } from '../src/hospitalmgmt/validate.js';
import { db, resetMgmt } from './helpers/fakeHospitalMgmtRepo.js';

const H1 = 'a'.repeat(24);
const H2 = 'b'.repeat(24);
const admin = { id: 'e'.repeat(24), role: 'hospital_admin', hospitalId: H1 };
const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };

beforeEach(() => {
  resetMgmt();
  db.hospitals.set(H1, { _id: H1, code: 'H1', name: 'City Heart', capabilities: {}, location: { coordinates: [73.8, 18.5] } });
  db.hospitals.set(H2, { _id: H2, code: 'H2', name: 'Other', capabilities: {}, location: { coordinates: [73.9, 18.6] } });
});

describe('profile', () => {
  it('updates phone and cath lab only', async () => {
    const h = await svc.updateProfile(admin, validateProfile({ phone: '020 2000 0000', cathLab: true }));
    expect(h.phone).toBe('02020000000'); expect(h.capabilities.cathLab).toBe(true); expect(h.name).toBe('City Heart');
  });
  it('rejects an empty change and a bad phone', () => {
    expect(() => validateProfile({})).toThrow();
    expect(() => validateProfile({ phone: 'abc' })).toThrow();
  });
  it('refuses an account with no hospital', async () => {
    expect(await code(svc.getProfile({ id: 'x', role: 'doctor' }))).toBe('NO_HOSPITAL');
  });
});

describe('doctors and the cardiologist flag', () => {
  it('follows the roster', async () => {
    const d = await svc.addDoctor(admin, validateDoctorCreate({ name: 'Dr Rao', specialty: 'cardiologist', onDuty: true }));
    expect(db.hospitals.get(H1).capabilities.cardiologistOnDuty).toBe(true);
    await svc.changeDoctor(admin, d.id, { onDuty: false });
    expect(db.hospitals.get(H1).capabilities.cardiologistOnDuty).toBe(false);
    await svc.changeDoctor(admin, d.id, { onDuty: true });
    await svc.changeDoctor(admin, d.id, { isActive: false });
    expect(db.hospitals.get(H1).capabilities.cardiologistOnDuty).toBe(false);
  });
  it('a non-cardiologist on duty does not set the flag', async () => {
    await svc.addDoctor(admin, validateDoctorCreate({ name: 'Dr Em', specialty: 'emergency', onDuty: true }));
    expect(db.hospitals.get(H1).capabilities.cardiologistOnDuty).toBe(false);
  });
  it('rejects duplicate names and other hospitals\' doctors', async () => {
    const d = await svc.addDoctor(admin, validateDoctorCreate({ name: 'Dr Rao', specialty: 'other' }));
    expect(await code(svc.addDoctor(admin, { name: 'Dr Rao', specialty: 'other' }))).toBe('VALIDATION_ERROR');
    expect(await code(svc.changeDoctor({ ...admin, hospitalId: H2 }, d.id, { onDuty: true }))).toBe('NOT_FOUND');
  });
});

describe('ED bays', () => {
  it('occupy → clear → ready, and refuses illegal moves', async () => {
    let board = await svc.addBay(admin, { label: 'B1' });
    const id = board.bays[0].id;
    board = await svc.bayAction(admin, id, validateBayAction({ action: 'occupy', triageLevel: 2, complaint: 'Chest pain' }));
    expect(board.bays[0]).toMatchObject({ status: 'occupied', triageLevel: 2 });
    expect(await code(svc.bayAction(admin, id, { action: 'occupy', triageLevel: 1 }))).toBe('BAY_STATE');
    expect(await code(svc.removeBay(admin, id))).toBe('BAY_STATE');
    board = await svc.bayAction(admin, id, { action: 'clear' });
    expect(board.bays[0]).toMatchObject({ status: 'cleaning', triageLevel: null });
    board = await svc.bayAction(admin, id, { action: 'ready' });
    expect(board.bays[0].status).toBe('vacant');
    board = await svc.removeBay(admin, id);
    expect(board.bays).toHaveLength(0);
  });
  it('rejects an unknown patient id and another hospital\'s bay', async () => {
    const board = await svc.addBay(admin, { label: 'B1' });
    expect(await code(svc.bayAction(admin, board.bays[0].id, { action: 'occupy', triageLevel: 3, patientId: 'HT-2026-9999' }))).toBe('VALIDATION_ERROR');
    expect(await code(svc.bayAction({ ...admin, hospitalId: H2 }, board.bays[0].id, { action: 'clear' }))).toBe('NOT_FOUND');
  });
  it('caps the number of bays and rejects duplicate labels', async () => {
    await svc.addBay(admin, { label: 'B1' });
    expect(await code(svc.addBay(admin, { label: 'B1' }))).toBe('VALIDATION_ERROR');
    for (let i = 2; i <= svc.MAX_BAYS; i++) await svc.addBay(admin, { label: `B${i}` });
    expect(await code(svc.addBay(admin, { label: 'extra' }))).toBe('BAY_LIMIT');
  });
});

describe('history', () => {
  const t = (s) => new Date(Date.UTC(2026, 10, 1, 10, 0, s));
  it('shows the name only for cases this hospital accepted', async () => {
    db.patients.push({ _id: 'p1'.padEnd(24, '0'), patientId: 'HT-2026-0001', fullName: 'Rahul Sharma' }, { _id: 'p2'.padEnd(24, '0'), patientId: 'HT-2026-0002', fullName: 'Asha Rao' });
    db.cases.push(
      { _id: 'c1'.padEnd(24, '0'), patient: 'p1'.padEnd(24, '0'), hospital: H1, status: 'arrived', severity: 'critical', notifiedHospitals: [{ hospital: H1, notifiedAt: t(0) }], acceptedAt: t(30) },
      { _id: 'c2'.padEnd(24, '0'), patient: 'p2'.padEnd(24, '0'), hospital: H2, status: 'accepted', severity: 'high', notifiedHospitals: [{ hospital: H1, notifiedAt: t(0) }], rejectedHospitals: [H1] },
    );
    const r = await svc.history(admin, validateHistoryQuery({}));
    const a = r.items.find((i) => i.caseId.startsWith('c1')); const b = r.items.find((i) => i.caseId.startsWith('c2'));
    expect(a).toMatchObject({ outcome: 'accepted', patientName: 'Rahul Sharma', respondedAfterSeconds: 30 });
    expect(b).toMatchObject({ outcome: 'rejected', patientName: null, patientId: null });
  });
});

describe('logic', () => {
  it('maps outcomes', () => {
    expect(outcomeOf({ hospital: H1, status: 'arrived' }, H1)).toBe('accepted');
    expect(outcomeOf({ hospital: H2, status: 'arrived' }, H1)).toBe('elsewhere');
    expect(outcomeOf({ rejectedHospitals: [H1], status: 'pending' }, H1)).toBe('rejected');
    expect(outcomeOf({ timedOutHospitals: [H1], status: 'pending' }, H1)).toBe('no_answer');
    expect(outcomeOf({ hospital: H1, status: 'cancelled' }, H1)).toBe('cancelled');
  });
  it('builds history filters scoped to the hospital', () => {
    for (const s of ['all', 'accepted', 'rejected', 'no_answer', 'elsewhere', 'cancelled']) expect(historyFilter(H1, s)['notifiedHospitals.hospital']).toBe(H1);
    expect(historyFilter(H1, 'cancelled').status).toBe('cancelled');
  });
  it('averages response time and handles none', () => {
    expect(averageResponse([], H1)).toEqual({ seconds: null, cases: 0 });
    const c = (s) => ({ notifiedHospitals: [{ hospital: H1, notifiedAt: new Date(0) }], acceptedAt: new Date(s * 1000) });
    expect(averageResponse([c(10), c(30)], H1)).toEqual({ seconds: 20, cases: 2 });
  });
  it('summarises beds', () => {
    const s = summariseBeds([{ _id: { ward: 'CCU', status: 'free' }, n: 2 }, { _id: { ward: 'CCU', status: 'occupied' }, n: 3 }]);
    expect(s).toMatchObject({ free: 2, total: 5 }); expect(s.wards.CCU.occupied).toBe(3);
  });
});

describe('dashboard', () => {
  it('counts what this hospital sees', async () => {
    db.beds.push({ hospital: H1, ward: 'CCU', status: 'free' }, { hospital: H1, ward: 'CCU', status: 'occupied' }, { hospital: H2, ward: 'CCU', status: 'free' });
    db.ambulances = 2;
    await svc.addDoctor(admin, { name: 'Dr Rao', specialty: 'cardiologist', onDuty: true });
    const d = await svc.dashboard(admin);
    expect(d.kpis).toMatchObject({ freeBeds: 1, doctorsOnDuty: 1, cardiologistOnDuty: true, ambulancesAvailable: 2, avgResponseSeconds: null });
  });
});
