import { describe, expect, it } from 'vitest';
import { Admission, AuditLog, Bed, Counter, Doctor, Hospital, HospitalCase, Patient, User } from '../../src/models/index.js';
import { EVENTS, appEvents } from '../../src/events.js';
import { isCardiologistOnDuty } from '../../src/services/doctors.js';
import { recordHospitalCase, updateHospitalCase } from '../../src/services/hospitalCases.js';
import { agent, bearer, loginAs, makeHospital, makeUser, patientSession, PDF, lastMailToken } from './helpers.js';
import { outbox } from '../../src/utils/mailer.js';

/** A hospital with a logged-in admin, staff member and doctor, a doctor record, and a few beds. */
async function world(name = 'Test Heart Hospital') {
  const hospital = await makeHospital(name);
  const out = { hospital };
  for (const role of ['hospital_admin', 'hospital_staff', 'doctor']) {
    const user = await makeUser({ role, hospital });
    out[role] = { user, token: (await loginAs(user)).token };
  }
  out.doc = await Doctor.create({ hospital: hospital._id, user: out.doctor.user._id, fullName: 'Dr. Test', specialization: 'Cardiology', isCardiologist: true, onDuty: true });
  out.beds = await Bed.insertMany([
    { hospital: hospital._id, type: 'general', label: 'GEN-1' }, { hospital: hospital._id, type: 'general', label: 'GEN-2' },
    { hospital: hospital._id, type: 'icu', label: 'ICU-1' }, { hospital: hospital._id, type: 'ccu', label: 'CCU-1' },
  ]);
  return out;
}
const call = (token) => ({
  get: (u) => agent().get(`/api/hospital${u}`).set(bearer(token)),
  post: (u, b) => agent().post(`/api/hospital${u}`).set(bearer(token)).send(b),
  patch: (u, b) => agent().patch(`/api/hospital${u}`).set(bearer(token)).send(b),
  del: (u) => agent().delete(`/api/hospital${u}`).set(bearer(token)),
});
const patientWith = async (extra = {}) => {
  const s = await patientSession();
  if (extra.allergies) await Patient.updateOne({ _id: s.patient._id }, { $set: { allergies: extra.allergies } });
  return s;
};
const admit = (w, patient, bed, over = {}) => call(w.hospital_staff.token).post('/admissions', { patientId: patient.patientId, bedId: String(bed._id), doctorId: String(w.doc._id), ...over });

describe('central admin: hospital registration (81)', () => {
  const body = (over = {}) => ({ name: 'Lakeview Heart Hospital', address: 'Baner, Pune', phone: '020 2000 0000', location: { latitude: 18.559, longitude: 73.7868 }, capabilities: { cathLab: true, icuBeds: 4, ccuBeds: 2, cardiologist24x7: true, alsAmbulances: 1 }, admin: { name: 'Asha Admin', email: 'asha@lakeview.example' }, ...over });
  const admin = async () => (await loginAs(await makeUser({ role: 'central_admin' }))).token;

  it('is for central admins only', async () => {
    const w = await world();
    const p = await patientSession();
    for (const t of [w.hospital_admin.token, w.doctor.token, p.token]) expect((await agent().post('/api/admin/hospitals').set(bearer(t)).send(body())).status).toBe(403);
    expect((await agent().post('/api/admin/hospitals').send(body())).status).toBe(401);
  });

  it('creates the hospital with a GeoJSON point and its admin account, and emails a one-time password link', async () => {
    const token = await admin();
    outbox.length = 0;
    const res = await agent().post('/api/admin/hospitals').set(bearer(token)).send(body());
    expect(res.status).toBe(201);
    expect(res.body.hospital.location).toEqual({ latitude: 18.559, longitude: 73.7868 });
    const stored = await Hospital.findById(res.body.hospital._id);
    expect(stored.location.coordinates).toEqual([73.7868, 18.559]);
    expect(stored.capabilities.cathLab).toBe(true);
    const user = await User.findOne({ email: 'asha@lakeview.example' }).select('+passwordHash');
    expect(user).toMatchObject({ role: 'hospital_admin' });
    expect(String(user.hospitalId)).toBe(String(stored._id));
    expect(res.body.invite).toBe('sent');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    // the admin chooses their own password from the link and can then sign in
    const link = await lastMailToken();
    expect((await agent().post('/api/auth/reset-password').send({ token: link, password: 'NewPass123' })).status).toBe(200);
    expect((await agent().post('/api/auth/login/staff').send({ identifier: 'asha@lakeview.example', password: 'NewPass123' })).status).toBe(200);
  });

  it('refuses duplicates and leaves nothing half-made', async () => {
    const token = await admin();
    await makeUser({ role: 'patient', email: 'taken@example.com' });
    const clash = await agent().post('/api/admin/hospitals').set(bearer(token)).send(body({ admin: { name: 'X', email: 'taken@example.com' } }));
    expect(clash.status).toBe(409);
    expect(await Hospital.countDocuments({ name: 'Lakeview Heart Hospital' })).toBe(0);
    expect((await agent().post('/api/admin/hospitals').set(bearer(token)).send(body())).status).toBe(201);
    const again = await agent().post('/api/admin/hospitals').set(bearer(token)).send(body({ admin: { name: 'Y', email: 'other@lakeview.example' } }));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('HOSPITAL_EXISTS');
    expect(await User.countDocuments({ email: 'other@lakeview.example' })).toBe(0);
  });

  it('validates the location, capabilities and unknown fields', async () => {
    const token = await admin();
    const post = (b) => agent().post('/api/admin/hospitals').set(bearer(token)).send(b);
    expect((await post(body({ location: { latitude: 95, longitude: 73 } }))).status).toBe(400);
    expect((await post(body({ location: { latitude: 18, longitude: 200 } }))).status).toBe(400);
    expect((await post(body({ capabilities: { icuBeds: -1 } }))).status).toBe(400);
    expect((await post(body({ admin: { name: 'A', email: 'nope' } }))).status).toBe(400);
    expect((await post(body({ isActive: false }))).status).toBe(400);
  });

  it('lists, reads and edits hospitals; closing one switches off its staff at once', async () => {
    const token = await admin();
    const w = await world();
    const list = await agent().get('/api/admin/hospitals').set(bearer(token));
    expect(list.body.hospitals.map((h) => h.name)).toContain('Test Heart Hospital');
    const one = await agent().get(`/api/admin/hospitals/${w.hospital._id}`).set(bearer(token));
    expect(one.body.availability.totalVacant).toBe(4);
    expect((await agent().patch(`/api/admin/hospitals/${w.hospital._id}`).set(bearer(token)).send({ phone: '020 1111 1111', capabilities: { icuBeds: 9 } })).body.hospital.capabilities.icuBeds).toBe(9);
    expect((await agent().get('/api/hospital/beds').set(bearer(w.doctor.token))).status).toBe(200);
    await agent().patch(`/api/admin/hospitals/${w.hospital._id}`).set(bearer(token)).send({ isActive: false });
    expect((await agent().get('/api/hospital/beds').set(bearer(w.doctor.token))).status).toBe(401); // token stops working
    expect((await loginAs(w.doctor.user)).res.status).toBe(401);
    expect((await agent().patch('/api/admin/hospitals/nope').set(bearer(token)).send({ phone: '1' })).status).toBe(404);
  });

  it('writes audit entries without the invite link', async () => {
    const token = await admin();
    await agent().post('/api/admin/hospitals').set(bearer(token)).send(body());
    const e = await AuditLog.findOne({ action: 'hospital.create' });
    expect(e).toBeTruthy();
    expect(JSON.stringify(e.toJSON())).not.toMatch(/reset-password|token/i);
  });
});

describe('hospital scoping and roles', () => {
  it('keeps each hospital inside its own data', async () => {
    const a = await world('Hospital A');
    const b = await world('Hospital B');
    const p = await patientWith();
    const adm = (await admit(a, p.patient, a.beds[0])).body.admission;
    expect((await call(b.hospital_staff.token).get(`/admissions/${adm._id}`)).status).toBe(404);
    expect((await call(b.doctor.token).get(`/admissions/${adm._id}/record`)).status).toBe(404);
    expect((await call(b.hospital_staff.token).patch(`/beds/${a.beds[1]._id}`, { status: 'cleaning' })).status).toBe(404);
    expect((await call(b.hospital_admin.token).patch(`/doctors/${a.doc._id}`, { onDuty: false })).status).toBe(404);
    const names = (await call(b.hospital_staff.token).get('/beds')).body.beds.map((x) => x.label);
    expect(names).toHaveLength(4);
    expect((await agent().get(`/api/hospital/beds?hospitalId=${a.hospital._id}`).set(bearer(b.hospital_staff.token))).status).toBe(403);
    expect((await call(b.hospital_staff.token).post('/beds', { type: 'icu', label: 'X', hospitalId: String(a.hospital._id) })).status).toBe(403);
  });

  it('keeps patients and anonymous callers out, and enforces the role of each action', async () => {
    const w = await world();
    const p = await patientWith();
    expect((await agent().get('/api/hospital/dashboard')).status).toBe(401);
    expect((await agent().get('/api/hospital/dashboard').set(bearer(p.token))).status).toBe(403);
    expect((await call(w.doctor.token).post('/beds', { type: 'general', label: 'Z-1' })).status).toBe(403);
    expect((await call(w.hospital_staff.token).post('/doctors', { fullName: 'New Doc', specialization: 'X' })).status).toBe(403);
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const rx = { drug: 'Aspirin', dose: '75 mg', frequency: 'daily', duration: '5 days' };
    expect((await call(w.hospital_staff.token).post(`/admissions/${adm._id}/prescriptions`, rx)).status).toBe(403);
    expect((await call(w.hospital_admin.token).post(`/admissions/${adm._id}/prescriptions`, rx)).status).toBe(403);
    expect((await call(w.hospital_staff.token).post(`/admissions/${adm._id}/discharge`, { diagnosis: 'x', treatment: 'y' })).status).toBe(403);
    expect((await call(w.doctor.token).post('/admissions', { patientId: 'HT-2026-0001', bedId: String(w.beds[1]._id), doctorId: String(w.doc._id) })).status).toBe(403);
  });
});

describe('dashboard (82)', () => {
  it('reports the KPIs from real data', async () => {
    const w = await world();
    await Hospital.updateOne({ _id: w.hospital._id }, { $set: { 'capabilities.alsAmbulances': 3 } });
    const now = Date.now();
    await HospitalCase.insertMany([
      { hospital: w.hospital._id, emergencyCaseId: 'c1', status: 'accepted', receivedAt: new Date(now - 60_000), respondedAt: new Date(now - 30_000) },
      { hospital: w.hospital._id, emergencyCaseId: 'c2', status: 'received', receivedAt: new Date(now - 10_000) },
      { hospital: w.hospital._id, emergencyCaseId: 'c3', status: 'rejected', receivedAt: new Date(now - 200_000), respondedAt: new Date(now - 190_000) },
    ]);
    const p = await patientWith();
    await admit(w, p.patient, w.beds[0]);
    const { kpis } = (await call(w.hospital_admin.token).get('/dashboard')).body;
    expect(kpis).toMatchObject({ incomingEmergencies: 2, freeBeds: 3, doctorsOnDuty: 1, cardiologistOnDuty: true, ambulancesAvailable: 3, activeAdmissions: 1, respondedCases: 2 });
    expect(kpis.freeBedsByType).toEqual({ general: 1, icu: 1, ccu: 1 });
    expect(kpis.avgResponseSeconds).toBe(20);
  });

  it('shows no average response time before any case was answered', async () => {
    const w = await world();
    expect((await call(w.doctor.token).get('/dashboard')).body.kpis.avgResponseSeconds).toBeNull();
  });
});

describe('doctors (83)', () => {
  it('adds a doctor with a login (invite by email) and one without', async () => {
    const w = await world();
    outbox.length = 0;
    const res = await call(w.hospital_admin.token).post('/doctors', { fullName: 'Dr. New', specialization: 'Cardiology', isCardiologist: true, email: 'new.doc@test.example', phone: '98765 43210' });
    expect(res.status).toBe(201);
    expect(res.body.invite).toBe('sent');
    const user = await User.findOne({ email: 'new.doc@test.example' });
    expect(user).toMatchObject({ role: 'doctor' });
    expect(String(user.hospitalId)).toBe(String(w.hospital._id));
    expect(String(res.body.doctor.user)).toBe(String(user._id));
    const nologin = await call(w.hospital_admin.token).post('/doctors', { fullName: 'Dr. Visiting', specialization: 'Anaesthesia' });
    expect(nologin.status).toBe(201);
    expect(nologin.body.invite).toBeNull();
    const list = (await call(w.hospital_staff.token).get('/doctors')).body.doctors;
    expect(list.find((d) => d.fullName === 'Dr. New').hasLogin).toBe(true);
  });

  it('refuses a taken email without leaving a doctor behind', async () => {
    const w = await world();
    const res = await call(w.hospital_admin.token).post('/doctors', { fullName: 'Dr. Clash', specialization: 'X', email: w.doctor.user.email });
    expect(res.status).toBe(409);
    expect(await Doctor.countDocuments({ fullName: 'Dr. Clash' })).toBe(0);
  });

  it('keeps the on-duty roster and the cardiologist-on-duty answer in step, and announces changes', async () => {
    const w = await world();
    expect(await isCardiologistOnDuty(w.hospital._id)).toBe(true);
    const seen = [];
    const listener = (e) => seen.push(e);
    appEvents.on(EVENTS.DOCTOR_DUTY_CHANGED, listener);
    await call(w.hospital_admin.token).patch(`/doctors/${w.doc._id}`, { onDuty: false });
    appEvents.off(EVENTS.DOCTOR_DUTY_CHANGED, listener);
    expect(await isCardiologistOnDuty(w.hospital._id)).toBe(false);
    expect(seen.at(-1)).toMatchObject({ hospitalId: String(w.hospital._id), cardiologistOnDuty: false, doctorsOnDuty: 0 });
  });

  it('switches off the login and the duty flag when a doctor is deactivated', async () => {
    const w = await world();
    await call(w.hospital_admin.token).patch(`/doctors/${w.doc._id}`, { isActive: false });
    expect(await isCardiologistOnDuty(w.hospital._id)).toBe(false);
    expect((await loginAs(w.doctor.user)).res.status).toBe(401);
  });

  it('validates input', async () => {
    const w = await world();
    expect((await call(w.hospital_admin.token).post('/doctors', { fullName: '', specialization: 'X' })).status).toBe(400);
    expect((await call(w.hospital_admin.token).post('/doctors', { fullName: 'A', specialization: 'X', hospital: 'x' })).status).toBe(400);
    expect((await call(w.hospital_admin.token).patch(`/doctors/${w.doc._id}`, {})).status).toBe(400);
  });
});

describe('beds (85)', () => {
  it('adds beds, rejects duplicate labels and reports counts by type and status', async () => {
    const w = await world();
    expect((await call(w.hospital_staff.token).post('/beds', { type: 'icu', label: 'ICU-2' })).status).toBe(201);
    expect((await call(w.hospital_staff.token).post('/beds', { type: 'icu', label: 'ICU-2' })).status).toBe(409);
    const bulk = await call(w.hospital_staff.token).post('/beds/bulk', { type: 'general', prefix: 'W', count: 5 });
    expect(bulk.status).toBe(201);
    expect(bulk.body.availability.general).toMatchObject({ total: 7, vacant: 7 });
    expect((await call(w.hospital_staff.token).post('/beds/bulk', { type: 'general', prefix: 'W', count: 2 })).status).toBe(409);
  });

  it('moves a bed through vacant, cleaning and reserved, and never into or out of occupied by hand', async () => {
    const w = await world();
    const bed = w.beds[0];
    const set = (id, status) => call(w.hospital_staff.token).patch(`/beds/${id}`, { status });
    expect((await set(bed._id, 'cleaning')).body.bed.status).toBe('cleaning');
    expect((await set(bed._id, 'reserved')).status).toBe(409); // cleaning goes to vacant only
    expect((await set(bed._id, 'vacant')).status).toBe(200);
    expect((await set(bed._id, 'reserved')).body.availability.general.reserved).toBe(1);
    expect((await call(w.hospital_staff.token).patch(`/beds/${bed._id}`, { status: 'occupied' })).status).toBe(400);
    const p = await patientWith();
    await admit(w, p.patient, w.beds[1]);
    const res = await set(w.beds[1]._id, 'vacant');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BED_STATE');
  });

  it('removes only vacant beds', async () => {
    const w = await world();
    const p = await patientWith();
    await admit(w, p.patient, w.beds[0]);
    expect((await call(w.hospital_staff.token).del(`/beds/${w.beds[0]._id}`)).status).toBe(409);
    expect((await call(w.hospital_staff.token).del(`/beds/${w.beds[1]._id}`)).status).toBe(200);
    expect((await call(w.hospital_staff.token).del(`/beds/${w.beds[1]._id}`)).status).toBe(404);
  });

  it('holds the bed limit under parallel requests', async () => {
    const w = await world();
    await Counter.create({ _id: `beds:${w.hospital._id}`, seq: 298 });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call(w.hospital_staff.token).post('/beds', { type: 'general', label: `P-${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'BED_LIMIT')).toBe(true);
    expect(await Bed.countDocuments({ label: /^P-/ })).toBe(2);
  });

  it('announces updated counts after every change', async () => {
    const w = await world();
    const seen = [];
    const listener = (e) => seen.push(e);
    appEvents.on(EVENTS.BEDS_CHANGED, listener);
    await call(w.hospital_staff.token).patch(`/beds/${w.beds[2]._id}`, { status: 'cleaning' });
    appEvents.off(EVENTS.BEDS_CHANGED, listener);
    expect(seen).toHaveLength(1);
    expect(seen[0].hospitalId).toBe(String(w.hospital._id));
    expect(seen[0].availability.icu).toMatchObject({ total: 1, vacant: 0, cleaning: 1 });
  });
});

describe('admission (84)', () => {
  it('admits to a bed and doctor, marking the bed occupied and linking the emergency case', async () => {
    const w = await world();
    const p = await patientWith();
    const hc = await recordHospitalCase({ hospitalId: w.hospital._id, emergencyCaseId: 'EC-1', patientId: p.patient.patientId, summary: 'Chest pain' });
    const res = await admit(w, p.patient, w.beds[2], { reason: 'Chest pain', caseId: String(hc._id) });
    expect(res.status).toBe(201);
    expect(res.body.admission).toMatchObject({ ward: 'icu', status: 'admitted', emergencyCaseId: 'EC-1' });
    const bed = await Bed.findById(w.beds[2]._id);
    expect(bed.status).toBe('occupied');
    expect(String(bed.admission)).toBe(res.body.admission._id);
    expect((await HospitalCase.findById(hc._id)).status).toBe('admitted');
    const list = (await call(w.doctor.token).get('/admissions')).body.admissions;
    expect(list[0]).toMatchObject({ patientName: p.patient.fullName, bedLabel: 'ICU-1', doctorName: 'Dr. Test' });
    expect(await AuditLog.countDocuments({ action: 'admission.create', resourceId: p.patient.patientId })).toBe(1);
  });

  it('gives each bed to only one of many parallel admissions', async () => {
    const w = await world();
    const people = await Promise.all(Array.from({ length: 8 }, () => patientWith()));
    const results = await Promise.all(people.map((p) => admit(w, p.patient, w.beds[0])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'BED_UNAVAILABLE')).toBe(true);
    expect(await Admission.countDocuments({ status: 'admitted' })).toBe(1);
  });

  it('admits one patient only once, even to two beds at the same moment, and frees the losing bed', async () => {
    const w = await world();
    const p = await patientWith();
    const results = await Promise.all([admit(w, p.patient, w.beds[0]), admit(w, p.patient, w.beds[1]), admit(w, p.patient, w.beds[2])]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_ADMITTED')).toBe(true);
    expect(await Bed.countDocuments({ hospital: w.hospital._id, status: 'occupied' })).toBe(1);
    expect(await Bed.countDocuments({ hospital: w.hospital._id, status: 'vacant' })).toBe(3);
  });

  it('refuses a patient who is already admitted at another hospital', async () => {
    const a = await world('Hospital A');
    const b = await world('Hospital B');
    const p = await patientWith();
    await admit(a, p.patient, a.beds[0]);
    expect((await admit(b, p.patient, b.beds[0])).body.error.code).toBe('ALREADY_ADMITTED');
    expect((await Bed.findById(b.beds[0]._id)).status).toBe('vacant');
  });

  it('checks the patient, doctor, bed and case', async () => {
    const a = await world('Hospital A');
    const b = await world('Hospital B');
    const p = await patientWith();
    const q = await patientWith();
    const post = (b2) => call(a.hospital_staff.token).post('/admissions', b2);
    const base = { patientId: p.patient.patientId, bedId: String(a.beds[0]._id), doctorId: String(a.doc._id) };
    expect((await post({ ...base, patientId: 'HT-2099-9999' })).body.error.details.patientId).toBeDefined();
    expect((await post({ ...base, doctorId: String(b.doc._id) })).body.error.details.doctorId).toBeDefined();
    expect((await post({ ...base, bedId: String(b.beds[0]._id) })).body.error.details.bedId).toBeDefined();
    expect((await post({ ...base, patientId: 'bad' })).status).toBe(400);
    const theirs = await recordHospitalCase({ hospitalId: b.hospital._id, emergencyCaseId: 'X', patientId: p.patient.patientId });
    expect((await post({ ...base, caseId: String(theirs._id) })).body.error.details.caseId).toBeDefined();
    const mine = await recordHospitalCase({ hospitalId: a.hospital._id, emergencyCaseId: 'Y', patientId: q.patient.patientId });
    expect((await post({ ...base, caseId: String(mine._id) })).body.error.details.caseId).toMatch(/different patient/);
    expect(await Bed.countDocuments({ status: 'occupied' })).toBe(0);
    await Doctor.updateOne({ _id: a.doc._id }, { $set: { isActive: false } });
    expect((await post(base)).body.error.details.doctorId).toBeDefined();
  });

  it('lets a reserved bed be used', async () => {
    const w = await world();
    await call(w.hospital_staff.token).patch(`/beds/${w.beds[0]._id}`, { status: 'reserved' });
    const p = await patientWith();
    expect((await admit(w, p.patient, w.beds[0])).status).toBe(201);
    await Bed.updateOne({ _id: w.beds[1]._id }, { $set: { status: 'cleaning' } });
    expect((await admit(w, (await patientWith()).patient, w.beds[1])).body.error.code).toBe('BED_UNAVAILABLE');
  });
});

describe('patient record for the treating hospital', () => {
  it('shows the record only while admitted, logging the view first, never storing health text', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'SecretAllergenQ', severity: 'severe' }] });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const res = await call(w.doctor.token).get(`/admissions/${adm._id}/record`);
    expect(res.status).toBe(200);
    expect(res.body.patient.allergies[0].allergen).toBe('SecretAllergenQ');
    expect(res.body.patient.qrToken).toBeUndefined();
    const e = await AuditLog.findOne({ action: 'record.view' });
    expect(e).toMatchObject({ resourceId: p.patient.patientId, role: 'doctor' });
    expect(JSON.stringify(e.toJSON())).not.toContain('SecretAllergenQ');
  });

  it('shows nothing if the audit entry cannot be written', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'SecretAllergenQ', severity: 'severe' }] });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const { vi } = await import('vitest');
    const spy = vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('down'));
    const res = await call(w.doctor.token).get(`/admissions/${adm._id}/record`);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SecretAllergenQ');
  });
});

describe('visit records (87)', () => {
  it('adds notes and vitals, validating them, and lists them', async () => {
    const w = await world();
    const adm = (await admit(w, (await patientWith()).patient, w.beds[0])).body.admission;
    const rec = (b) => call(w.doctor.token).post(`/admissions/${adm._id}/records`, b);
    expect((await rec({ kind: 'note', text: 'Chest pain eased.' })).status).toBe(201);
    expect((await rec({ kind: 'vitals', heartRate: 88, systolic: 120, diastolic: 80, spo2: 97 })).status).toBe(201);
    expect((await rec({ kind: 'note', text: '' })).status).toBe(400);
    expect((await rec({ kind: 'vitals' })).status).toBe(400);
    expect((await rec({ kind: 'vitals', heartRate: 5000 })).status).toBe(400);
    expect((await rec({ kind: 'vitals', systolic: 120 })).status).toBe(400);
    expect((await rec({ kind: 'other', text: 'x' })).status).toBe(400);
    const list = (await call(w.hospital_staff.token).get(`/admissions/${adm._id}/records`)).body.records;
    expect(list).toHaveLength(2);
    expect(list[0].authorName).toBe(w.doctor.user.name);
  });

  it('stores ECG and lab files by their real type, serving them only to this hospital, logged', async () => {
    const a = await world('A');
    const b = await world('B');
    const adm = (await admit(a, (await patientWith()).patient, a.beds[0])).body.admission;
    const up = (buf, name, kind = 'ecg') => agent().post(`/api/hospital/admissions/${adm._id}/records/file`).set(bearer(a.doctor.token)).field('kind', kind).field('title', 'ECG 10:00').attach('file', buf, name);
    expect((await up(Buffer.from('<html>'), 'ecg.pdf')).status).toBe(400);
    expect((await up(PDF, 'ecg.pdf', 'weird')).status).toBe(400);
    const ok = await up(PDF, '../../x.pdf');
    expect(ok.status).toBe(201);
    expect(ok.body.record.hasFile).toBe(true);
    expect(JSON.stringify(ok.body)).not.toMatch(/storedName/);
    const url = `/api/hospital/admissions/${adm._id}/records/${ok.body.record._id}/file`;
    const got = await agent().get(url).set(bearer(a.hospital_staff.token));
    expect(got.status).toBe(200);
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect((await agent().get(url).set(bearer(b.doctor.token))).status).toBe(404);
    expect((await agent().get(url)).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'record.view', 'meta.view': 'visit_file' })).toBe(1);
  });

  it('closes the record when the patient is discharged', async () => {
    const w = await world();
    const adm = (await admit(w, (await patientWith()).patient, w.beds[0])).body.admission;
    await call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, { diagnosis: 'Angina', treatment: 'Medication' });
    const res = await call(w.doctor.token).post(`/admissions/${adm._id}/records`, { kind: 'note', text: 'late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ADMISSION_CLOSED');
  });
});

describe('prescriptions and allergy warning (88)', () => {
  const rx = (over = {}) => ({ drug: 'Aspirin', dose: '75 mg', frequency: 'Once daily', duration: '30 days', ...over });

  it('saves a prescription with no warning when nothing matches', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'Penicillin', severity: 'severe' }] });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const res = await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx());
    expect(res.status).toBe(201);
    expect(res.body.prescription.allergyOverride).toBeUndefined();
    expect(res.body.prescription.prescriberName).toBe(w.doctor.user.name);
  });

  it('warns before saving when the drug matches an allergy (also within a drug family) and saves nothing', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'Penicillin', severity: 'severe' }] });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    for (const drug of ['Penicillin V', 'Amoxicillin 500', 'AMPICILLIN']) {
      const res = await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx({ drug }));
      expect(res.status, drug).toBe(409);
      expect(res.body.error.code).toBe('ALLERGY_WARNING');
      expect(res.body.error.details.allergens).toEqual(['Penicillin']);
    }
    expect((await call(w.doctor.token).get(`/admissions/${adm._id}/prescriptions`)).body.prescriptions).toHaveLength(0);
    const check = await call(w.doctor.token).get(`/admissions/${adm._id}/prescriptions/check?drug=amoxicillin`);
    expect(check.body.allergens).toEqual(['Penicillin']);
    expect((await call(w.doctor.token).get(`/admissions/${adm._id}/prescriptions/check?drug=paracetamol`)).body.allergens).toEqual([]);
  });

  it('saves after the doctor confirms, recording the override in the prescription and the audit log', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'Penicillin', severity: 'severe' }] });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const res = await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx({ drug: 'Amoxicillin', acknowledgeAllergy: true }));
    expect(res.status).toBe(201);
    expect(res.body.prescription.allergyOverride.allergens).toEqual(['Penicillin']);
    expect(await AuditLog.countDocuments({ action: 'prescription.allergy_override', resourceId: p.patient.patientId })).toBe(1);
    expect(JSON.stringify((await AuditLog.findOne({ action: 'prescription.allergy_override' })).toJSON())).not.toMatch(/Amoxicillin|Penicillin/);
  });

  it('does not warn on look-alike words, and validates fields', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'Aspirin', severity: 'mild' }] });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    expect((await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx({ drug: 'Paracetamol' }))).status).toBe(201);
    expect((await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx({ drug: '' }))).status).toBe(400);
    expect((await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx({ prescribedBy: 'x' }))).status).toBe(400);
    expect((await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, rx({ drug: 'Ecosprin' }))).status).toBe(409);
  });
});

describe('discharge summary (89) and patient history (17)', () => {
  const summary = { diagnosis: 'Unstable angina', treatment: 'Stent placed in LAD', followUp: 'Clinic in 2 weeks', medicines: [{ drug: 'Clopidogrel', dose: '75 mg', frequency: 'daily', duration: '12 months' }] };

  it('pre-fills a draft from the admission, then finalizes: bed to cleaning, history entry, case closed', async () => {
    const w = await world();
    const p = await patientWith();
    const hc = await recordHospitalCase({ hospitalId: w.hospital._id, emergencyCaseId: 'EC-9', patientId: p.patient.patientId });
    const adm = (await admit(w, p.patient, w.beds[2], { reason: 'Chest pain', caseId: String(hc._id) })).body.admission;
    await call(w.doctor.token).post(`/admissions/${adm._id}/prescriptions`, { drug: 'Aspirin', dose: '75 mg', frequency: 'daily', duration: '30 days' });
    const draft = (await call(w.doctor.token).get(`/admissions/${adm._id}/discharge`)).body;
    expect(draft.finalized).toBe(false);
    expect(draft.summary.diagnosis).toBe('Chest pain');
    expect(draft.summary.medicines).toEqual([{ drug: 'Aspirin', dose: '75 mg', frequency: 'daily', duration: '30 days' }]);

    const res = await call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, summary);
    expect(res.status).toBe(201);
    expect(res.body.context.hospital.name).toBe('Test Heart Hospital');
    expect((await Admission.findById(adm._id)).status).toBe('discharged');
    const bed = await Bed.findById(w.beds[2]._id);
    expect(bed.status).toBe('cleaning');
    expect(bed.admission).toBeUndefined();
    expect((await HospitalCase.findById(hc._id))).toMatchObject({ status: 'closed', outcome: 'Discharged' });
    const history = (await Patient.findById(p.patient._id)).hospitalizations;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ hospital: 'Test Heart Hospital', reason: 'Unstable angina' });
    expect(String(history[0].dischargeSummaryId)).toBe(res.body.summary._id);
    const again = (await call(w.hospital_staff.token).get(`/admissions/${adm._id}/discharge`)).body;
    expect(again.finalized).toBe(true);
    expect(again.summary.treatment).toBe('Stent placed in LAD');
  });

  it('discharges once, even when requests arrive together, with one history entry', async () => {
    const w = await world();
    const p = await patientWith();
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const results = await Promise.all(Array.from({ length: 10 }, () => call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, summary)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ADMISSION_CLOSED')).toBe(true);
    expect((await Patient.findById(p.patient._id)).hospitalizations).toHaveLength(1);
  });

  it('can admit the same patient again after discharge', async () => {
    const w = await world();
    const p = await patientWith();
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    await call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, summary);
    expect((await admit(w, p.patient, w.beds[1])).status).toBe(201);
  });

  it('validates the summary', async () => {
    const w = await world();
    const adm = (await admit(w, (await patientWith()).patient, w.beds[0])).body.admission;
    expect((await call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, { treatment: 'x' })).status).toBe(400);
    expect((await call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, { ...summary, medicines: [{ drug: 'x' }] })).status).toBe(400);
    expect((await Admission.findById(adm._id)).status).toBe('admitted');
  });

  it('lets the patient read their own summary and nobody else\'s, and shows it in their history', async () => {
    const w = await world();
    const p = await patientWith();
    const other = await patientWith();
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const id = (await call(w.doctor.token).post(`/admissions/${adm._id}/discharge`, summary)).body.summary._id;
    const mine = await agent().get(`/api/patients/me/discharge-summaries/${id}`).set(p.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.summary.diagnosis).toBe('Unstable angina');
    expect(mine.body.context.patient.patientId).toBe(p.patient.patientId);
    expect((await agent().get(`/api/patients/me/discharge-summaries/${id}`).set(other.auth)).status).toBe(404);
    const me = (await agent().get('/api/patients/me').set(p.auth)).body.patient;
    expect(me.hospitalizations[0].dischargeSummaryId).toBe(id);
    // the patient cannot change or delete a hospital-written entry
    expect((await agent().delete(`/api/patients/me/hospitalizations/${me.hospitalizations[0]._id}`).set(p.auth)).status).toBe(403);
  });
});

describe('emergency department (86)', () => {
  it('adds bays, occupies one atomically, clears and readies it', async () => {
    const w = await world();
    const t = w.hospital_staff.token;
    const bay = (await call(t).post('/ed/bays', { label: 'ED-1' })).body.bays[0];
    expect((await call(t).post('/ed/bays', { label: 'ED-1' })).status).toBe(409);
    const act = (b) => call(t).patch(`/ed/bays/${bay._id}`, b);
    const p = await patientWith();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => act({ action: 'occupy', triageLevel: 2, complaint: `case ${i}`, patientId: p.patient.patientId })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'BAY_STATE')).toBe(true);
    const board = (await call(t).get('/ed')).body;
    expect(board.bays[0]).toMatchObject({ status: 'occupied', triageLevel: 2, patientId: p.patient.patientId });
    expect((await act({ action: 'ready' })).status).toBe(409);
    expect((await act({ action: 'clear' })).body.bays[0]).toMatchObject({ status: 'cleaning' });
    expect((await call(t).get('/ed')).body.bays[0].patientId).toBeUndefined();
    expect((await act({ action: 'ready' })).body.bays[0].status).toBe('vacant');
  });

  it('validates triage level and patient ID, lists arriving cases and scopes to the hospital', async () => {
    const a = await world('A');
    const b = await world('B');
    const bay = (await call(a.hospital_staff.token).post('/ed/bays', { label: 'ED-1' })).body.bays[0];
    const act = (b2) => call(a.hospital_staff.token).patch(`/ed/bays/${bay._id}`, b2);
    expect((await act({ action: 'occupy', triageLevel: 9 })).status).toBe(400);
    expect((await act({ action: 'occupy', triageLevel: 3, patientId: 'HT-2099-9999' })).body.error.details.patientId).toBeDefined();
    expect((await act({ action: 'dance' })).status).toBe(400);
    await HospitalCase.insertMany([
      { hospital: a.hospital._id, emergencyCaseId: 'x1', status: 'accepted', etaMinutes: 8, summary: 'STEMI' },
      { hospital: a.hospital._id, emergencyCaseId: 'x2', status: 'rejected' },
      { hospital: b.hospital._id, emergencyCaseId: 'x3', status: 'accepted' },
    ]);
    const board = (await call(a.doctor.token).get('/ed')).body;
    expect(board.arriving.map((c) => c.emergencyCaseId)).toEqual(['x1']);
    expect((await call(b.hospital_staff.token).patch(`/ed/bays/${bay._id}`, { action: 'clear' })).status).toBe(404);
  });

  it('removes only vacant bays and holds the bay limit', async () => {
    const w = await world();
    const t = w.hospital_staff.token;
    const bay = (await call(t).post('/ed/bays', { label: 'ED-1' })).body.bays[0];
    await call(t).patch(`/ed/bays/${bay._id}`, { action: 'occupy', triageLevel: 1 });
    expect((await call(t).del(`/ed/bays/${bay._id}`)).status).toBe(409);
    await Counter.updateOne({ _id: `edbays:${w.hospital._id}` }, { $set: { seq: 38 } });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => call(t).post('/ed/bays', { label: `B-${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
  });
});

describe('emergency history (90) and the case contract', () => {
  it('lists cases with timings and outcomes, filters by status and counts them', async () => {
    const w = await world();
    const now = Date.now();
    await HospitalCase.insertMany([
      { hospital: w.hospital._id, emergencyCaseId: 'h1', status: 'closed', receivedAt: new Date(now - 600_000), respondedAt: new Date(now - 540_000), arrivedAt: new Date(now - 300_000), closedAt: new Date(now - 60_000), outcome: 'Discharged' },
      { hospital: w.hospital._id, emergencyCaseId: 'h2', status: 'rejected', receivedAt: new Date(now - 100_000), respondedAt: new Date(now - 90_000), rejectionReason: 'No ICU bed' },
    ]);
    const all = (await call(w.hospital_admin.token).get('/history')).body;
    expect(all.total).toBe(2);
    expect(all.counts).toEqual({ closed: 1, rejected: 1 });
    const closed = all.cases.find((c) => c.emergencyCaseId === 'h1');
    expect(closed).toMatchObject({ respondedAfterSeconds: 60, arrivedAfterSeconds: 300, openSeconds: 540, outcome: 'Discharged' });
    expect((await call(w.hospital_admin.token).get('/history?status=rejected')).body.cases.map((c) => c.rejectionReason)).toEqual(['No ICU bed']);
    expect((await call(w.hospital_admin.token).get('/history?status=bogus')).status).toBe(400);
    expect((await call(w.hospital_admin.token).get('/history?limit=1&page=2')).body.cases).toHaveLength(1);
  });

  it('shows another hospital none of it', async () => {
    const a = await world('A');
    const b = await world('B');
    await HospitalCase.create({ hospital: a.hospital._id, emergencyCaseId: 'secret', status: 'received' });
    expect((await call(b.hospital_admin.token).get('/history')).body.total).toBe(0);
  });

  it('records a case once and fills in the response times from the status', async () => {
    const w = await world();
    const one = await recordHospitalCase({ hospitalId: w.hospital._id, emergencyCaseId: 'E1', summary: 'Chest pain' });
    const two = await recordHospitalCase({ hospitalId: w.hospital._id, emergencyCaseId: 'E1', summary: 'ignored' });
    expect(String(two._id)).toBe(String(one._id));
    expect(two.summary).toBe('Chest pain');
    expect(await HospitalCase.countDocuments()).toBe(1);
    const acc = await updateHospitalCase({ hospitalId: w.hospital._id, emergencyCaseId: 'E1' }, { status: 'accepted', etaMinutes: 11 });
    expect(acc.respondedAt).toBeInstanceOf(Date);
    expect(acc.etaMinutes).toBe(11);
    expect((await updateHospitalCase({ hospitalId: w.hospital._id, emergencyCaseId: 'E1' }, { status: 'arrived' })).arrivedAt).toBeInstanceOf(Date);
  });
});

describe('automated health summary (94)', () => {
  it('builds the summary from the template with vitals against the baseline', async () => {
    const w = await world();
    const p = await patientWith({ allergies: [{ allergen: 'Penicillin', reaction: 'Anaphylaxis', severity: 'severe' }] });
    await Patient.updateOne({ _id: p.patient._id }, { $set: { bloodGroup: 'B+', medications: [{ drug: 'Clopidogrel', dose: '75 mg' }], cardiacConditions: [{ type: 'stent', year: 2022 }] } });
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    const post = (b) => call(w.doctor.token).post(`/admissions/${adm._id}/records`, { kind: 'vitals', ...b });
    await post({ heartRate: 80, spo2: 98 });
    await post({ heartRate: 100, spo2: 94, systolic: 150, diastolic: 95 });
    const res = await call(w.doctor.token).get(`/admissions/${adm._id}/summary`);
    expect(res.status).toBe(200);
    const text = res.body.summary.text;
    expect(text).toContain('blood group B+');
    expect(text).toContain('heart rate 100 bpm (+20 bpm vs baseline 80)');
    expect(text).toContain('SpO2 94% (-4 % vs baseline 98)');
    expect(text).toContain('blood pressure 150/95 mmHg');
    expect(text).toContain('stent (2022)');
    expect(text).toContain('Penicillin (Anaphylaxis) - SEVERE');
    expect(text).toContain('Clopidogrel 75 mg [blood thinner]');
    expect(await AuditLog.countDocuments({ action: 'record.view', 'meta.view': 'summary' })).toBe(1);
  });

  it('says plainly when there are no readings, and is part of the QR full-record view', async () => {
    const w = await world();
    const p = await patientWith();
    const adm = (await admit(w, p.patient, w.beds[0])).body.admission;
    expect((await call(w.doctor.token).get(`/admissions/${adm._id}/summary`)).body.summary.text).toContain('no readings on record');
    const url = (await agent().get('/api/patients/me/qr').set(p.auth)).body.url;
    const full = await agent().get(`/api/passport/${url.split('/p/')[1]}/full`).set(bearer(w.doctor.token));
    expect(full.body.summary.text).toContain(p.patient.patientId);
  });
});
