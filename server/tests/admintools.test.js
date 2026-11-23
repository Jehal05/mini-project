import { describe, it, expect } from 'vitest';
import * as svc from '../src/admintools/service.js';
import { validateAuditQuery, validateHospitalRegistration } from '../src/admintools/validate.js';

const good = { code: 'new-1', name: 'New Heart Care', latitude: 18.5, longitude: 73.8, adminName: 'Asha Rao', adminEmail: 'Asha@Example.com', adminPassword: 'Strong#Pass2026', cathLab: true };
const fakeRepo = () => {
  const hospitals = []; const users = []; const audits = [];
  return {
    hospitals, users, audits,
    findHospitalByCode: async (c) => hospitals.find((h) => h.code === c) ?? null,
    findUserByEmail: async (e) => users.find((u) => u.email === e) ?? null,
    createHospital: async (d) => { const h = { _id: `h${hospitals.length}`, ...d }; hospitals.push(h); return h; },
    createUser: async (d) => { if (d.email === 'boom@x.com') throw new Error('db down'); const u = { _id: `u${users.length}`, ...d }; users.push(u); return u; },
    deleteHospital: async (id) => { const i = hospitals.findIndex((h) => h._id === id); if (i >= 0) hospitals.splice(i, 1); },
    writeAudit: async (d) => { audits.push(d); },
    listAudit: async () => ({ items: [{ _id: 'a1', createdAt: new Date(), action: 'x', actor: { name: 'Admin', role: 'central_admin' } }], total: 1 }),
  };
};

describe('hospital registration', () => {
  it('cleans the input', () => {
    const v = validateHospitalRegistration(good);
    expect(v.code).toBe('NEW-1'); expect(v.adminEmail).toBe('asha@example.com');
  });
  it('rejects weak passwords, bad coordinates and unknown fields', () => {
    for (const bad of [{ adminPassword: 'short' }, { latitude: 120 }, { latitude: undefined }, { code: 'a' }, { role: 'central_admin' }, { adminEmail: 'nope' }]) {
      expect(() => validateHospitalRegistration({ ...good, ...bad })).toThrow();
    }
  });
  it('creates a hospital and its administrator, and audits it', async () => {
    const repo = fakeRepo();
    const out = await svc.registerHospital(validateHospitalRegistration(good), { userId: 'adm' }, repo);
    expect(out.hospital.code).toBe('NEW-1');
    expect(repo.hospitals[0].location.coordinates).toEqual([73.8, 18.5]);
    expect(repo.users[0].role).toBe('hospital_admin');
    expect(repo.users[0].passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(out)).not.toContain('scrypt');
    expect(repo.audits[0].action).toBe('admin_register_hospital');
  });
  it('refuses a duplicate code or email', async () => {
    const repo = fakeRepo();
    await svc.registerHospital(validateHospitalRegistration(good), {}, repo);
    await expect(svc.registerHospital(validateHospitalRegistration(good), {}, repo)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('removes the hospital if the account cannot be made', async () => {
    const repo = fakeRepo();
    await expect(svc.registerHospital(validateHospitalRegistration({ ...good, adminEmail: 'boom@x.com' }), {}, repo)).rejects.toThrow('db down');
    expect(repo.hospitals).toHaveLength(0);
  });
});

describe('audit log', () => {
  it('validates filters with defaults', () => {
    expect(validateAuditQuery({})).toEqual({ page: 1, limit: 25 });
    expect(() => validateAuditQuery({ from: 'not a date' })).toThrow();
    expect(() => validateAuditQuery({ limit: '500' })).toThrow();
  });
  it('presents entries without raw ids of users', async () => {
    const out = await svc.listAudit({ page: 1, limit: 25 }, fakeRepo());
    expect(out.items[0]).toMatchObject({ actorName: 'Admin', actorRole: 'central_admin' });
  });
});

describe('overview', () => {
  it('drops items without a real location', async () => {
    const repo = { mapHospitals: async () => [{ _id: 'h', name: 'A', location: { coordinates: [73, 18] }, freeBeds: 2 }], mapAmbulances: async () => [{ _id: 'a', location: { coordinates: [0, 0] } }], mapLiveCases: async () => [] };
    const o = await svc.overview(repo);
    expect(o.hospitals[0].location).toEqual({ latitude: 18, longitude: 73 });
    expect(o.ambulances).toHaveLength(0);
  });
});
