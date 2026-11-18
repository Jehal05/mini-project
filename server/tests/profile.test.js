import { describe, expect, it } from 'vitest';
import { AuditLog, Patient } from '../src/models/index.js';
import { agent, bearer, contact, makeHospital, makeUser, loginAs, patientSession } from './helpers.js';

const api = (s) => ({
  get: (u) => s.agent.get(`/api/patients/me${u}`).set(s.auth),
  post: (u, b) => s.agent.post(`/api/patients/me${u}`).set(s.auth).send(b),
  patch: (u, b) => s.agent.patch(`/api/patients/me${u}`).set(s.auth).send(b),
  put: (u, b) => s.agent.put(`/api/patients/me${u}`).set(s.auth).send(b),
  del: (u) => s.agent.delete(`/api/patients/me${u}`).set(s.auth),
});

describe('profile access', () => {
  it('needs a login and the patient role', async () => {
    expect((await agent().get('/api/patients/me')).status).toBe(401);
    const doctor = await loginAs(await makeUser({ role: 'doctor', hospital: await makeHospital() }));
    expect((await agent().get('/api/patients/me').set(bearer(doctor.token))).status).toBe(403);
  });

  it('returns only the signed-in patient, with no QR token or user id', async () => {
    const a = await patientSession();
    const b = await patientSession();
    const res = await api(a).get('');
    expect(res.status).toBe(200);
    expect(res.body.patient.patientId).toBe(a.patient.patientId);
    expect(res.body.patient.patientId).not.toBe(b.patient.patientId);
    expect(JSON.stringify(res.body)).not.toMatch(/qrToken|"user"/);
  });

  it('rejects another patient\'s item ids (no IDOR) and unknown ids', async () => {
    const a = await patientSession();
    const b = await patientSession();
    const added = await api(a).post('/allergies', { allergen: 'Penicillin', severity: 'severe' });
    const id = added.body.patient.allergies[0]._id;
    expect((await api(b).patch(`/allergies/${id}`, { severity: 'mild' })).status).toBe(404);
    expect((await api(b).del(`/allergies/${id}`)).status).toBe(404);
    expect((await api(b).del('/allergies/not-an-id')).status).toBe(404);
    expect((await Patient.findById(a.patient._id)).allergies[0].severity).toBe('severe');
  });

  it('ignores a patient id sent in the body and rejects unknown fields', async () => {
    const a = await patientSession();
    const b = await patientSession();
    const res = await api(a).patch('/personal', { fullName: 'New Name', patientId: b.patient.patientId });
    expect(res.status).toBe(400);
    for (const bad of [{ qrToken: 'x' }, { user: 'x' }, { consent: {} }]) expect((await api(a).patch('/personal', bad)).status).toBe(400);
  });
});

describe('personal information and preferences', () => {
  it('saves details, computes age, syncs the account name and persists', async () => {
    const s = await patientSession();
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - 40); dob.setDate(dob.getDate() - 2);
    const res = await api(s).patch('/personal', { fullName: 'Rahul K Sharma', dateOfBirth: dob.toISOString().slice(0, 10), gender: 'male', bloodGroup: 'O+', city: 'Pune' });
    expect(res.status).toBe(200);
    expect(res.body.patient.age).toBe(40);
    expect((await api(s).get('')).body.patient.bloodGroup).toBe('O+');
    expect((await agent().get('/api/auth/me').set(s.auth)).body.user.name).toBe('Rahul K Sharma');
  });

  it('validates blood group, future birth dates and gender', async () => {
    const s = await patientSession();
    expect((await api(s).patch('/personal', { bloodGroup: 'Z+' })).status).toBe(400);
    expect((await api(s).patch('/personal', { dateOfBirth: '2999-01-01' })).status).toBe(400);
    expect((await api(s).patch('/personal', { gender: 'robot' })).status).toBe(400);
  });

  it('updates notification preferences and location consent', async () => {
    const s = await patientSession();
    const res = await api(s).put('/preferences', { email: false, webPush: false, whatsapp: true, locationConsent: false });
    expect(res.body.patient.notificationPreferences).toMatchObject({ email: false, webPush: false, whatsapp: true });
    expect(res.body.patient.consent.location).toBe(false);
    expect((await api(s).put('/preferences', { email: 'yes' })).status).toBe(400);
  });
});

describe('medical sections', () => {
  it('adds, edits and deletes entries in every section', async () => {
    const s = await patientSession();
    const samples = {
      cardiacConditions: { type: 'stent', year: 2022 },
      medicalConditions: { name: 'Hypertension' },
      allergies: { allergen: 'Penicillin', reaction: 'Rash', severity: 'severe' },
      medications: { drug: 'Aspirin', dose: '75 mg', frequency: 'Daily' },
      hospitalizations: { hospital: 'City Hospital (fictional)', admittedOn: '2023-03-01', dischargedOn: '2023-03-05', reason: 'Chest pain' },
      familyHistory: { relative: 'Father', condition: 'Heart attack', ageAtDiagnosis: 50 },
    };
    for (const [section, body] of Object.entries(samples)) {
      const added = await api(s).post(`/${section}`, body);
      expect(added.status, section).toBe(201);
      const id = added.body.patient[section][0]._id;
      expect((await api(s).patch(`/${section}/${id}`, { notes: undefined, ...Object.fromEntries(Object.entries(body).slice(0, 1)) })).status, section).toBe(200);
      expect((await api(s).del(`/${section}/${id}`)).body.patient[section]).toHaveLength(0);
    }
  });

  it('validates entries (year range, severity, discharge before admission)', async () => {
    const s = await patientSession();
    expect((await api(s).post('/cardiacConditions', { type: 'stent', year: 1800 })).status).toBe(400);
    expect((await api(s).post('/cardiacConditions', { type: 'made_up' })).status).toBe(400);
    expect((await api(s).post('/allergies', { allergen: 'X', severity: 'deadly' })).status).toBe(400);
    expect((await api(s).post('/allergies', { allergen: '' })).status).toBe(400);
    expect((await api(s).post('/hospitalizations', { hospital: 'H', admittedOn: '2023-03-05', dischargedOn: '2023-03-01' })).status).toBe(400);
  });

  it('flags blood thinners from the list (any case) and from the manual toggle', async () => {
    const s = await patientSession();
    await api(s).post('/medications', { drug: 'Warfarin 5mg', dose: '5 mg' });
    await api(s).post('/medications', { drug: 'Paracetamol' });
    const manual = await api(s).post('/medications', { drug: 'Special Tablet', isBloodThinner: true });
    const meds = Object.fromEntries(manual.body.patient.medications.map((m) => [m.drug, m.isBloodThinner]));
    expect(meds).toEqual({ 'Warfarin 5mg': true, Paracetamol: false, 'Special Tablet': true });
  });

  it('does not flag a drug that only contains a listed name inside another word', async () => {
    const s = await patientSession();
    const res = await api(s).post('/medications', { drug: 'Nonwarfarinol' });
    expect(res.body.patient.medications[0].isBloodThinner).toBe(false);
  });

  it('caps a section at 50 entries even with parallel requests', async () => {
    const s = await patientSession();
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => api(s).post('/medicalConditions', { name: `Condition ${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(50);
    expect(results.filter((r) => r.status === 409)).toHaveLength(10);
    expect((await Patient.findById(s.patient._id)).medicalConditions).toHaveLength(50);
  });

  it('keeps hospital-written hospitalizations read-only for the patient', async () => {
    const s = await patientSession();
    await Patient.updateOne({ _id: s.patient._id }, { $push: { hospitalizations: { hospital: 'H', dischargeSummaryId: s.patient._id } } });
    const id = (await Patient.findById(s.patient._id)).hospitalizations[0]._id;
    expect((await api(s).patch(`/hospitalizations/${id}`, { hospital: 'Changed' })).status).toBe(403);
    expect((await api(s).del(`/hospitalizations/${id}`)).status).toBe(403);
  });

  it('writes record.edit audit entries with section and operation only, never the health text', async () => {
    const s = await patientSession();
    await api(s).post('/allergies', { allergen: 'SecretAllergenXYZ', severity: 'severe' });
    const entries = await AuditLog.find({ action: 'record.edit' });
    expect(entries).toHaveLength(1);
    expect(entries[0].meta).toEqual({ section: 'allergies', op: 'add' });
    expect(entries[0].resourceId).toBe(s.patient.patientId);
    expect(JSON.stringify(entries[0].toJSON())).not.toMatch(/SecretAllergenXYZ/);
  });
});

describe('emergency contacts', () => {
  it('adds up to 3 with unique priorities and refuses a 4th', async () => {
    const s = await patientSession();
    for (let i = 1; i <= 3; i += 1) expect((await api(s).post('/contacts', contact({ name: `C${i}` }))).status).toBe(201);
    const res = await api(s).post('/contacts', contact({ name: 'C4' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTACT_LIMIT');
    const priorities = (await Patient.findById(s.patient._id)).emergencyContacts.map((c) => c.priority).sort();
    expect(priorities).toEqual([1, 2, 3]);
  });

  it('holds the limit of 3 under 20 parallel requests, with unique priorities', async () => {
    const s = await patientSession();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => api(s).post('/contacts', contact({ name: `P${i}` }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const stored = (await Patient.findById(s.patient._id)).emergencyContacts;
    expect(stored).toHaveLength(3);
    expect(stored.map((c) => c.priority).sort()).toEqual([1, 2, 3]);
  });

  it('rejects a taken priority and validates phone and email', async () => {
    const s = await patientSession();
    await api(s).post('/contacts', contact({ priority: 2 }));
    const clash = await api(s).post('/contacts', contact({ priority: 2 }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('PRIORITY_TAKEN');
    expect((await api(s).post('/contacts', contact({ phone: 'abc' }))).status).toBe(400);
    expect((await api(s).post('/contacts', contact({ email: 'nope' }))).status).toBe(400);
    expect((await api(s).post('/contacts', contact({ priority: 4 }))).status).toBe(400);
  });

  it('edits, deletes and reorders keeping priorities unique', async () => {
    const s = await patientSession();
    const ids = [];
    for (const n of ['A', 'B', 'C']) ids.push((await api(s).post('/contacts', contact({ name: n }))).body.patient.emergencyContacts.find((c) => c.name === n)._id);
    expect((await api(s).patch(`/contacts/${ids[0]}`, { name: 'A2' })).status).toBe(200);
    const re = await api(s).put('/contacts/order', { order: [ids[2], ids[0], ids[1]] });
    expect(re.body.patient.emergencyContacts.map((c) => [c.name, c.priority])).toEqual([['C', 1], ['A2', 2], ['B', 3]]);
    expect((await api(s).put('/contacts/order', { order: [ids[2], ids[0]] })).status).toBe(409); // must list every contact
    expect((await api(s).put('/contacts/order', { order: [ids[2], ids[2], ids[1]] })).status).toBe(400);
    const afterDelete = await api(s).del(`/contacts/${ids[2]}`);
    expect(afterDelete.body.patient.emergencyContacts).toHaveLength(2);
    expect((await api(s).post('/contacts', contact({ name: 'D' }))).status).toBe(201);
    const pr = (await Patient.findById(s.patient._id)).emergencyContacts.map((c) => c.priority);
    expect(new Set(pr).size).toBe(3);
  });

  it('cannot touch another patient\'s contact', async () => {
    const a = await patientSession();
    const b = await patientSession();
    const id = (await api(a).post('/contacts', contact())).body.patient.emergencyContacts[0]._id;
    expect((await api(b).patch(`/contacts/${id}`, { name: 'x' })).status).toBe(404);
    expect((await api(b).del(`/contacts/${id}`)).status).toBe(404);
    expect((await api(b).post(`/contacts/${id}/test-alert`, {})).status).toBe(404);
  });

  it('sends a test alert email, returns a wa.me link, and allows 3 per hour per contact regardless of preferences', async () => {
    const { outbox } = await import('../src/utils/mailer.js');
    const s = await patientSession();
    await api(s).put('/preferences', { email: false, whatsapp: false });
    const id = (await api(s).post('/contacts', contact())).body.patient.emergencyContacts[0]._id;
    outbox.length = 0;
    const first = await api(s).post(`/contacts/${id}/test-alert`, {});
    expect(first.status).toBe(200);
    expect(first.body.email).toBe('sent');
    expect(first.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(outbox.at(-1).to).toBe('anita@example.com');
    expect((await api(s).post(`/contacts/${id}/test-alert`, {})).status).toBe(200);
    expect((await api(s).post(`/contacts/${id}/test-alert`, {})).status).toBe(200);
    const blocked = await api(s).post(`/contacts/${id}/test-alert`, {});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('holds the test-alert limit under parallel requests', async () => {
    const s = await patientSession();
    const id = (await api(s).post('/contacts', contact())).body.patient.emergencyContacts[0]._id;
    const results = await Promise.all(Array.from({ length: 10 }, () => api(s).post(`/contacts/${id}/test-alert`, {})));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
  });

  it('skips email for a contact without one but still returns the WhatsApp link', async () => {
    const s = await patientSession();
    const id = (await api(s).post('/contacts', contact({ email: undefined }))).body.patient.emergencyContacts[0]._id;
    const res = await api(s).post(`/contacts/${id}/test-alert`, {});
    expect(res.body.email).toBe('skipped');
    expect(res.body.whatsappUrl).toContain('wa.me');
  });
});
