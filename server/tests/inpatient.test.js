import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/auth/authRepo.js', async () => await import('./helpers/fakeAuthRepo.js'));
vi.mock('../src/patients/patientRepo.js', async () => await import('./helpers/fakePatientRepo.js'));
vi.mock('../src/inpatient/repo.js', async () => await import('./helpers/fakeInpatientRepo.js'));

import * as svc from '../src/inpatient/service.js';
import { matchingAllergies } from '../src/inpatient/allergy.js';
import { validateAdmit, validateBed, validateDischarge, validateNote, validatePrescription } from '../src/inpatient/validate.js';
import { resetAuth } from './helpers/fakeAuthRepo.js';
import { resetPatients, db as pdb, createPatient } from './helpers/fakePatientRepo.js';
import { resetInpatient, db } from './helpers/fakeInpatientRepo.js';

const H1 = 'a'.repeat(24);
const H2 = 'b'.repeat(24);
const D1 = 'c'.repeat(24);
const staff = { id: 'e'.repeat(24), role: 'hospital_staff', hospitalId: H1 };
const doc = { id: 'f'.repeat(24), role: 'doctor', hospitalId: H1, doctorId: D1 };
const otherStaff = { id: '1'.repeat(24), role: 'hospital_staff', hospitalId: H2 };
const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };

let patient;
beforeEach(async () => {
  resetAuth(); resetPatients(); resetInpatient();
  db.hospitals.set(H1, 'City Heart Hospital');
  db.doctors.push({ _id: D1, hospital: H1, name: 'Dr Rao' });
  patient = await createPatient({ patientId: 'HT-2026-0001', fullName: 'Rahul Sharma', allergies: [{ allergen: 'Penicillin' }] });
});

const addBeds = async () => { const a = await svc.addBed(staff, { ward: 'CCU', label: 'CCU-1' }); const b = await svc.addBed(staff, { ward: 'GENERAL', label: 'G-1' }); return [a, b]; };
const admitRahul = async (bedId) => svc.admit(staff, { patientId: 'HT-2026-0001', bedId, doctorId: D1, reason: 'Chest pain' });

describe('beds (85)', () => {
  it('adds beds, counts them by ward, and refuses a repeated label', async () => {
    await addBeds();
    const { counts } = await svc.listBeds(staff);
    expect(counts.CCU.free).toBe(1);
    expect(counts.GENERAL.total).toBe(1);
    expect(await code(svc.addBed(staff, { ward: 'CCU', label: 'CCU-1' }))).toBe('VALIDATION_ERROR');
  });
  it('never shows or touches another hospital\'s beds', async () => {
    const [a] = await addBeds();
    expect((await svc.listBeds(otherStaff)).beds).toHaveLength(0);
    expect(await code(svc.setBedState(otherStaff, a.id, 'cleaning'))).toBe('NOT_FOUND');
  });
  it('lets a free bed be reserved or marked for cleaning, but not an occupied one', async () => {
    const [a] = await addBeds();
    expect((await svc.setBedState(staff, a.id, 'cleaning')).status).toBe('cleaning');
    await svc.setBedState(staff, a.id, 'free');
    await admitRahul(a.id);
    expect(await code(svc.setBedState(staff, a.id, 'free'))).toBe('BED_OCCUPIED');
    expect(await code(svc.removeBed(staff, a.id))).toBe('BED_OCCUPIED');
  });
  it('rejects a user that is not linked to a hospital', async () => {
    expect(await code(svc.listBeds({ id: '2'.repeat(24), role: 'hospital_staff' }))).toBe('NO_HOSPITAL');
  });
});

describe('admissions (84)', () => {
  it('admits a patient to a bed and fills the stay in', async () => {
    const [a] = await addBeds();
    const adm = await admitRahul(a.id);
    expect(adm.patientName).toBe('Rahul Sharma');
    expect(adm.ward).toBe('CCU');
    expect(adm.doctorName).toBe('Dr Rao');
    expect((await svc.listBeds(staff)).beds.find((b) => b.id === a.id).status).toBe('occupied');
    expect(await svc.listAdmissions(staff)).toHaveLength(1);
  });
  it('lets only one of two requests take the same bed, and never admits a patient twice', async () => {
    const [a, b] = await addBeds();
    await createPatient({ patientId: 'HT-2026-0002', fullName: 'Asha Rao' });
    const results = await Promise.allSettled([admitRahul(a.id), svc.admit(staff, { patientId: 'HT-2026-0002', bedId: a.id, doctorId: D1 })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await code(admitRahul(b.id))).toBe('ALREADY_ADMITTED');
    expect((await svc.listBeds(staff)).beds.find((x) => x.id === b.id).status).toBe('free');
  });
  it('completes the stay an ambulance arrival already made instead of duplicating it', async () => {
    const [a] = await addBeds();
    db.admissions.push({ _id: '9'.repeat(24), hospital: H1, patient: patient._id, patientId: patient.patientId, status: 'admitted', admittedAt: new Date() });
    const adm = await admitRahul(a.id);
    expect(adm.id).toBe('9'.repeat(24));
    expect(db.admissions).toHaveLength(1);
    expect(adm.bedId).toBe(a.id);
  });
  it('refuses an unknown patient, a doctor from elsewhere, and another hospital\'s bed', async () => {
    const [a] = await addBeds();
    expect(await code(svc.admit(staff, { patientId: 'HT-9999-0000', bedId: a.id, doctorId: D1 }))).toBe('VALIDATION_ERROR');
    expect(await code(svc.admit(staff, { patientId: 'HT-2026-0001', bedId: a.id, doctorId: '4'.repeat(24) }))).toBe('VALIDATION_ERROR');
    expect(await code(svc.admit(otherStaff, { patientId: 'HT-2026-0001', bedId: a.id, doctorId: D1 }))).toBe('VALIDATION_ERROR');
  });
  it('hides one hospital\'s stay from another', async () => {
    const [a] = await addBeds();
    const adm = await admitRahul(a.id);
    expect(await code(svc.getAdmission(otherStaff, adm.id))).toBe('NOT_FOUND');
  });
});

describe('visit records (87)', () => {
  it('stores notes and vitals, newest first, and logs the views', async () => {
    const [a] = await addBeds(); const adm = await admitRahul(a.id);
    await svc.addRecord(doc, adm.id, validateNote({ kind: 'note', text: 'Pain easing' }));
    await svc.addRecord(staff, adm.id, validateNote({ kind: 'vitals', heartRate: 92, spo2: 96 }));
    const list = await svc.listRecords(doc, adm.id);
    expect(list).toHaveLength(2);
    expect(list[0].kind).toBe('vitals');
    expect(list[0].vitals.heartRate).toBe(92);
    expect(db.audit.some((x) => x.action === 'record.view' && x.resourceRef === 'HT-2026-0001')).toBe(true);
  });
  it('checks the entry shape', () => {
    expect(() => validateNote({ kind: 'note', text: '  ' })).toThrow();
    expect(() => validateNote({ kind: 'vitals' })).toThrow();
    expect(() => validateNote({ kind: 'vitals', heartRate: 999 })).toThrow();
    expect(() => validateNote({ kind: 'photo' })).toThrow();
  });
});

describe('prescriptions and the allergy warning (88)', () => {
  it('matches drug families as whole words', () => {
    expect(matchingAllergies('Amoxicillin 500', [{ allergen: 'Penicillin' }])).toEqual(['Penicillin']);
    expect(matchingAllergies('Atorvastatin', [{ allergen: 'Penicillin' }])).toEqual([]);
  });
  it('stops a matching drug until the doctor confirms, then records the override', async () => {
    const [a] = await addBeds(); const adm = await admitRahul(a.id);
    const rx = validatePrescription({ drug: 'Amoxicillin', dose: '500 mg', frequency: 'Twice a day', duration: '5 days' });
    expect((await svc.checkAllergy(doc, adm.id, 'Amoxicillin')).allergens).toEqual(['Penicillin']);
    expect(await code(svc.prescribe(doc, adm.id, rx))).toBe('ALLERGY_WARNING');
    const done = await svc.prescribe(doc, adm.id, { ...rx, acknowledgeAllergy: true });
    expect(done.allergyOverride).toEqual(['Penicillin']);
    expect(db.audit.some((x) => x.action === 'prescription.allergy_override')).toBe(true);
  });
  it('saves a normal drug without a warning', async () => {
    const [a] = await addBeds(); const adm = await admitRahul(a.id);
    const done = await svc.prescribe(doc, adm.id, validatePrescription({ drug: 'Aspirin', dose: '75 mg', frequency: 'Daily', duration: '30 days' }));
    expect(done.allergyOverride).toBeNull();
  });
});

describe('discharge (89)', () => {
  it('drafts from the prescriptions, then finalizes once: bed to cleaning, history updated', async () => {
    const [a] = await addBeds(); const adm = await admitRahul(a.id);
    await svc.prescribe(doc, adm.id, validatePrescription({ drug: 'Aspirin', dose: '75 mg', frequency: 'Daily', duration: '30 days' }));
    const draft = await svc.getDischarge(doc, adm.id);
    expect(draft.finalized).toBe(false);
    expect(draft.summary.diagnosis).toBe('Chest pain');
    expect(draft.summary.medicines[0].drug).toBe('Aspirin');
    const body = validateDischarge({ diagnosis: 'Unstable angina', treatment: 'Stent placed', followUp: 'Clinic in 2 weeks', medicines: draft.summary.medicines });
    const out = await svc.finalizeDischarge(doc, adm.id, body);
    expect(out.finalized).toBe(true);
    expect((await svc.listBeds(staff)).beds[0].status).toBe('cleaning');
    const p = pdb.patients.get(String(patient._id));
    expect(p.hospitalizations).toHaveLength(1);
    expect(p.hospitalizations[0].hospital).toBe('City Heart Hospital');
    expect(p.hospitalizations[0].reason).toBe('Unstable angina');
    expect(await code(svc.finalizeDischarge(doc, adm.id, body))).toBe('ADMISSION_CLOSED');
    expect(p.hospitalizations).toHaveLength(1);
    expect(await code(svc.addRecord(doc, adm.id, validateNote({ kind: 'note', text: 'late' })))).toBe('ADMISSION_CLOSED');
    expect((await svc.getDischarge(doc, adm.id)).finalized).toBe(true);
    expect(await svc.listAdmissions(staff, 'discharged')).toHaveLength(1);
  });
  it('validates the form', () => {
    expect(() => validateDischarge({ diagnosis: '', treatment: 'x' })).toThrow();
    expect(() => validateDischarge({ diagnosis: 'x', treatment: 'y', medicines: [{ dose: '1' }] })).toThrow();
    expect(() => validateAdmit({ patientId: 'HT-1', bedId: 'nope', doctorId: D1 })).toThrow();
    expect(() => validateBed({ ward: 'SPA', label: 'x' })).toThrow();
  });
});
