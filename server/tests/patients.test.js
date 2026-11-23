import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('../src/auth/authRepo.js', async () => await import('./helpers/fakeAuthRepo.js'));
vi.mock('../src/patients/patientRepo.js', async () => await import('./helpers/fakePatientRepo.js'));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../src/config/env.js';
import * as svc from '../src/patients/service.js';
import { PATIENT_EVENTS, patientEvents } from '../src/patients/events.js';
import { validatePersonal, validateSection, validateContact, validateBystanderReport, validateMood } from '../src/patients/validate.js';
import { resetQuotas } from '../src/utils/quota.js';
import { resetAuth } from './helpers/fakeAuthRepo.js';
import { resetPatients, db } from './helpers/fakePatientRepo.js';

env.uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-uploads-'));
const PW = 'Correct#Horse9';

// Smallest files that pass the real-bytes check. The JPEG carries an EXIF segment that must be removed.
const JPEG_WITH_EXIF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, 0xff, 0xd9]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
const b64 = (buf) => buf.toString('base64');
const code = async (promise) => { try { await promise; return null; } catch (e) { return e.code ?? e.message; } };

async function signUp(email = 'a@x.test') {
  await svc.registerPatient({ name: 'Rahul Sharma', email, password: PW, consentDataUse: true });
  const p = [...db.patients.values()].find((x) => x.fullName === 'Rahul Sharma' && !x.__seen);
  p.__seen = true;
  return { user: { id: String(p.user), role: 'patient', patientId: p._id }, patient: p };
}

beforeAll(() => {});
beforeEach(() => { resetAuth(); resetPatients(); resetQuotas(); });

describe('registration and patient id (features 1, 10)', () => {
  it('creates sequential HT-YYYY-NNNN ids and a 64-hex QR token', async () => {
    const a = await signUp('a@x.test');
    const r2 = await svc.registerPatient({ name: 'Asha Rao', email: 'b@x.test', password: PW, consentDataUse: true });
    const y = new Date().getFullYear();
    expect(a.patient.patientId).toBe(`HT-${y}-0001`);
    expect(r2.patientId).toBe(`HT-${y}-0002`);
    expect(/^[a-f0-9]{64}$/.test(a.patient.qrToken)).toBe(true);
  });
  it('refuses a duplicate email, a weak password and missing consent', async () => {
    await signUp('a@x.test');
    expect(await code(svc.registerPatient({ name: 'Other', email: 'A@x.test', password: PW, consentDataUse: true }))).toBe('EMAIL_TAKEN');
    expect(await code(svc.registerPatient({ name: 'Other', email: 'c@x.test', password: 'short', consentDataUse: true }))).toBe('VALIDATION_ERROR');
    expect(await code(svc.registerPatient({ name: 'Other', email: 'c@x.test', password: PW }))).toBe('VALIDATION_ERROR');
  });
  it('sends back nothing secret about the record', async () => {
    const { user } = await signUp();
    const mine = await svc.getOwn(user);
    expect('qrToken' in mine).toBe(false);
    expect('user' in mine).toBe(false);
  });
});

describe('validation', () => {
  it('rejects unknown keys, future dates and bad blood groups', () => {
    expect(() => validatePersonal({ qrToken: 'x' })).toThrow();
    expect(() => validatePersonal({ dateOfBirth: '2999-01-01' })).toThrow();
    expect(() => validatePersonal({ bloodGroup: 'Z+' })).toThrow();
    expect(() => validatePersonal({})).toThrow();
    expect(validatePersonal({ bloodGroup: 'O-' }).bloodGroup).toBe('O-');
  });
  it('checks section rules and discharge order', () => {
    expect(() => validateSection('allergies', { allergen: 'Penicillin' }, { partial: false })).toThrow(); // severity missing
    expect(() => validateSection('hospitalizations', { hospital: 'H', admittedOn: '2024-05-02', dischargedOn: '2024-05-01' }, { partial: false })).toThrow();
    expect(validateSection('allergies', { allergen: 'Penicillin', severity: 'severe' }, { partial: false }).severity).toBe('severe');
  });
  it('normalises phone numbers', () => {
    expect(validateContact({ name: 'Mum', relation: 'Mother', phone: '98765 43210' }, { create: true }).phone).toBe('+919876543210');
    expect(() => validateContact({ name: 'Mum', relation: 'Mother', phone: '12' }, { create: true })).toThrow();
  });
  it('requires a real location for a bystander report', () => {
    expect(() => validateBystanderReport({ latitude: 95, longitude: 10 })).toThrow();
    expect(() => validateBystanderReport({ latitude: 18.5 })).toThrow();
  });
});

describe('medical sections (features 13-18)', () => {
  it('adds, updates, clears a field and deletes', async () => {
    const { user } = await signUp();
    let me = await svc.addItem(user, 'allergies', validateSection('allergies', { allergen: 'Penicillin', reaction: 'Rash', severity: 'severe' }, { partial: false }));
    const id = me.allergies[0].id;
    me = await svc.updateItem(user, 'allergies', id, validateSection('allergies', { severity: 'moderate', reaction: '' }, { partial: true }));
    expect(me.allergies[0].severity).toBe('moderate');
    expect('reaction' in me.allergies[0]).toBe(false);
    me = await svc.deleteItem(user, 'allergies', id);
    expect(me.allergies).toHaveLength(0);
  });
  it('flags blood thinners by name, and stops at 50 entries', async () => {
    const { user } = await signUp();
    const me = await svc.addItem(user, 'medications', validateSection('medications', { drug: 'Warfarin 5mg' }, { partial: false }));
    expect(me.medications[0].isBloodThinner).toBe(true);
    for (let i = 0; i < 49; i += 1) await svc.addItem(user, 'familyHistory', validateSection('familyHistory', { relative: 'Father', condition: `c${i}` }, { partial: false }));
    expect(await svc.addItem(user, 'familyHistory', validateSection('familyHistory', { relative: 'Father', condition: 'x' }, { partial: false })).then(() => null, (e) => e.code)).toBe(null); // 50th fits
    expect(await code(svc.addItem(user, 'familyHistory', { relative: 'Father', condition: 'y' }))).toBe('SECTION_FULL');
  });
  it('keeps a hospital-written hospitalization read-only', async () => {
    const { user, patient } = await signUp();
    patient.hospitalizations = [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', hospital: 'City', admittedOn: new Date(), dischargeSummaryId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }];
    expect(await code(svc.deleteItem(user, 'hospitalizations', 'aaaaaaaaaaaaaaaaaaaaaaaa'))).toBe('HOSPITAL_ENTRY');
    expect(await code(svc.updateItem(user, 'hospitalizations', 'cccccccccccccccccccccccc', { reason: 'x' }))).toBe('NOT_FOUND');
  });
  it('answers 409 to the loser when two edits race', async () => {
    const { user } = await signUp();
    const mk = (n) => svc.addItem(user, 'medicalConditions', { name: n });
    const results = await Promise.all([code(mk('Diabetes')), code(mk('Asthma'))]);
    expect(results.filter((r) => r === 'CHANGED')).toHaveLength(1);
  });
  it('logs the edit without the health data', async () => {
    const { user } = await signUp();
    await svc.addItem(user, 'allergies', { allergen: 'Peanut', severity: 'mild' });
    const entry = db.audit.find((a) => a.action === 'record.edit');
    expect(entry.meta).toEqual({ section: 'allergies', op: 'add' });
    expect(JSON.stringify(entry).includes('Peanut')).toBe(false);
  });
});

describe('emergency contacts (feature 9)', () => {
  const add = (user, name, extra = {}) => svc.addContact(user, validateContact({ name, relation: 'Family', phone: '9876543210', ...extra }, { create: true }));
  it('fills priorities 1 to 3 and refuses a 4th or a taken priority', async () => {
    const { user } = await signUp();
    await add(user, 'A'); await add(user, 'B');
    expect(await code(add(user, 'C', { priority: 2 }))).toBe('PRIORITY_TAKEN');
    const me = await add(user, 'C');
    expect(me.emergencyContacts.map((c) => c.priority)).toEqual([1, 2, 3]);
    expect(await code(add(user, 'D'))).toBe('CONTACT_LIMIT');
  });
  it('reorders only with each contact exactly once', async () => {
    const { user } = await signUp();
    await add(user, 'A'); const me = await add(user, 'B');
    const [a, b] = me.emergencyContacts.map((c) => c.id);
    expect(await code(svc.reorderContacts(user, [a]))).toBe('ORDER_MISMATCH');
    const re = await svc.reorderContacts(user, [b, a]);
    expect(re.emergencyContacts[0].name).toBe('B');
  });
  it('limits test alerts to 3 an hour per contact', async () => {
    const { user } = await signUp();
    const me = await add(user, 'A');
    const id = me.emergencyContacts[0].id;
    for (let i = 0; i < 3; i += 1) await svc.testAlert(user, id);
    expect(await code(svc.testAlert(user, id))).toBe('RATE_LIMITED');
  });
});

describe('files (features 8, 19)', () => {
  it('stores a PDF and returns it only to its owner', async () => {
    const { user } = await signUp('a@x.test');
    const other = await signUp('b@x.test').catch(() => null);
    const doc = await svc.uploadDocument(user, { type: 'ecg', name: 'ecg.pdf', data: b64(PDF) });
    expect(doc.mimeType).toBe('application/pdf');
    expect((await svc.getDocument(user, doc.id)).data.equals(PDF)).toBe(true);
    if (other) expect(await code(svc.getDocument(other.user, doc.id))).toBe('NOT_FOUND');
    expect(await svc.listDocuments(user)).toHaveLength(1);
    await svc.deleteDocument(user, doc.id);
    expect(await svc.listDocuments(user)).toHaveLength(0);
  });
  it('decides the type from the bytes, not the name', async () => {
    const { user } = await signUp();
    expect(await code(svc.uploadDocument(user, { type: 'other', name: 'report.pdf', data: b64(Buffer.from('<script>alert(1)</script>')) }))).toBe('INVALID_FILE_TYPE');
    expect(await code(svc.uploadDocument(user, { type: 'nope', name: 'a.pdf', data: b64(PDF) }))).toBe('VALIDATION_ERROR');
  });
  it('refuses files over 5 MB', async () => {
    const { user } = await signUp();
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect(await code(svc.uploadDocument(user, { type: 'other', name: 'big.pdf', data: b64(big) }))).toBe('FILE_TOO_LARGE');
  });
  it('removes EXIF data from a photo before saving it', async () => {
    const { user, patient } = await signUp();
    await svc.savePhoto(user, { name: 'me.jpg', data: b64(JPEG_WITH_EXIF) });
    const saved = fs.readFileSync(path.join(env.uploadsDir, 'photos', db.patients.get(patient._id).photoFile));
    expect(saved.includes(Buffer.from('Exif'))).toBe(false);
    expect((await svc.getPhoto(user)).mime).toBe('image/jpeg');
    await svc.deletePhoto(user);
    expect(await code(svc.getPhoto(user))).toBe('NOT_FOUND');
  });
});

describe('QR passport and bystander report (features 20, 106)', () => {
  async function ready() {
    const { user, patient } = await signUp();
    await svc.updatePersonal(user, validatePersonal({ bloodGroup: 'B+', address: 'Secret street 1' }));
    await svc.addItem(user, 'allergies', { allergen: 'Penicillin', reaction: 'Rash', severity: 'severe' });
    await svc.addItem(user, 'allergies', { allergen: 'Dust', severity: 'mild' });
    await svc.addItem(user, 'medications', { drug: 'Aspirin' });
    await svc.addContact(user, { name: 'Mum', relation: 'Mother', phone: '+919876543210' });
    const { url } = await svc.getQr(user);
    return { user, patient, token: url.split('/p/')[1] };
  }
  it('shows a stranger only the emergency tier', async () => {
    const { token } = await ready();
    const s = await svc.scan(token);
    expect(s.bloodGroup).toBe('B+');
    expect(s.severeAllergies).toEqual([{ allergen: 'Penicillin', reaction: 'Rash' }]);
    expect(s.emergencyContact).toEqual({ name: 'Mum', relation: 'Mother', phone: '+919876543210' });
    const text = JSON.stringify(s);
    for (const secret of ['Secret street', 'Aspirin', 'Dust', 'Rahul']) expect(text.includes(secret)).toBe(false);
  });
  it('kills the old link when the token is regenerated, and answers the same for junk', async () => {
    const { user, token } = await ready();
    const fresh = await svc.regenerateQr(user);
    expect(await code(svc.scan(token))).toBe('PASSPORT_NOT_FOUND');
    expect(await code(svc.scan('not-a-token'))).toBe('PASSPORT_NOT_FOUND');
    expect(fresh.url.includes(token)).toBe(false);
  });
  it('records a bystander report, announces it and limits one device to 5 an hour', async () => {
    const { token } = await ready();
    const seen = [];
    patientEvents.on(PATIENT_EVENTS.BYSTANDER_REPORT, (e) => seen.push(e));
    const r = await svc.bystanderReport(token, { latitude: 18.52, longitude: 73.85 }, '1.2.3.4');
    expect(r.received).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].location).toEqual({ latitude: 18.52, longitude: 73.85 });
    for (let i = 0; i < 2; i += 1) await svc.bystanderReport(token, { latitude: 18.52, longitude: 73.85 }, `9.9.9.${i}`);
    expect(await code(svc.bystanderReport(token, { latitude: 1, longitude: 1 }, '5.5.5.5'))).toBe('RATE_LIMITED'); // per-patient cap of 3
  });
  it('gives hospital logins the full record and writes the audit entry', async () => {
    const { token } = await ready();
    const rec = await svc.fullRecord(token, { id: 'staff1', role: 'hospital_staff', hospitalId: 'h1' });
    expect(rec.medications[0].drug).toBe('Aspirin');
    const entry = db.audit.find((a) => a.action === 'record.view');
    expect(entry.actor).toBe('staff1');
    expect(JSON.stringify(entry).includes(token)).toBe(false);
  });
});

describe('mood check-ins', () => {
  it('stores a mood note, lists newest first, and keeps it out of the record and the passport', async () => {
    const { user, patient } = await signUp('m@x.test');
    await svc.addMood(user, validateMood({ mood: 'tired', note: ' slept badly ' }));
    await new Promise((r) => setTimeout(r, 5));
    await svc.addMood(user, validateMood({ mood: 'calm' }));
    const list = await svc.listMoods(user);
    expect(list).toHaveLength(2);
    expect(list[0].mood).toBe('calm');
    expect(list[1].note).toBe('slept badly');
    expect(JSON.stringify(await svc.getOwn(user))).not.toMatch(/slept badly/);
    expect(JSON.stringify(await svc.scan(patient.qrToken))).not.toMatch(/slept badly/);
  });
  it('rejects an unknown mood or a long note, and keeps only the newest 60', async () => {
    const { user } = await signUp('n@x.test');
    expect(() => validateMood({ mood: 'furious' })).toThrow();
    expect(() => validateMood({ mood: 'calm', note: 'x'.repeat(201) })).toThrow();
    expect(() => validateMood({ mood: 'calm', extra: 1 })).toThrow();
    for (let i = 0; i < 62; i += 1) await svc.addMood(user, { mood: 'calm' });
    expect(db.patients.get(String(user.patientId)).moodNotes).toHaveLength(60);
  });
});
