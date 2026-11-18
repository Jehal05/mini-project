import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLog } from '../src/models/index.js';
import { audit, authorize, errorHandler, hospitalScope, protect } from '../src/middleware/index.js';
import { drainBackground } from '../src/utils/background.js';
import { agent, bearer, loginAs, makeHospital, makeUser, app as realApp } from './helpers.js';

// A small app that exercises the middleware the way teammates' routes will.
function demoApp() {
  const a = express();
  a.use(express.json());
  a.get('/doctors-only', protect({ roles: ['doctor'] }), (req, res) => res.json({ ok: true }));
  a.get('/hospitals/:hospitalId/beds', protect({ roles: ['doctor', 'hospital_staff', 'hospital_admin', 'central_admin'], hospitalScoped: true }), (req, res) => res.json({ hospitalId: req.hospitalId }));
  a.get('/mine/beds', protect({ hospitalScoped: true }), (req, res) => res.json({ hospitalId: req.hospitalId }));
  a.get('/records/:id', protect({ roles: ['doctor'] }), audit('record.view', { resourceType: 'patient', resourceId: (req) => req.params.id }), (req, res) => res.json({ ok: true }));
  a.get('/records-fail/:id', protect({ roles: ['doctor'] }), audit('record.view', { resourceType: 'patient' }), (req, res) => res.status(404).json({}));
  a.use(errorHandler);
  return a;
}
const demo = demoApp();
const get = (path, token) => request(demo).get(path).set(token ? bearer(token) : {});
const settle = drainBackground;

describe('feature 6: role-based access control', () => {
  it('lets the right role in and keeps every other role out with 403', async () => {
    const hospital = await makeHospital();
    const doctor = await loginAs(await makeUser({ role: 'doctor', hospital }));
    expect((await get('/doctors-only', doctor.token)).status).toBe(200);
    for (const role of ['patient', 'hospital_staff', 'hospital_admin', 'central_admin']) {
      const other = await loginAs(await makeUser({ role, hospital: role.startsWith('hospital') ? hospital : undefined }));
      const res = await get('/doctors-only', other.token);
      expect(res.status, role).toBe(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    }
  });

  it('answers 401 without a token', async () => {
    expect((await get('/doctors-only')).status).toBe(401);
  });

  it('records denied access in the audit log', async () => {
    const patient = await loginAs(await makeUser());
    await get('/doctors-only', patient.token);
    const entry = await AuditLog.findOne({ action: 'access.denied' });
    expect(entry).toMatchObject({ role: 'patient', outcome: 'denied' });
  });

  it('refuses to be configured with a role that does not exist', () => {
    expect(() => authorize('surgeon')).toThrow(/unknown role/);
  });
});

describe('feature 5: hospital scoping', () => {
  it('lets staff see their own hospital and blocks every other hospital', async () => {
    const [h1, h2] = [await makeHospital('Hospital One'), await makeHospital('Hospital Two')];
    for (const role of ['doctor', 'hospital_staff', 'hospital_admin']) {
      const { token } = await loginAs(await makeUser({ role, hospital: h1 }));
      const own = await get(`/hospitals/${h1._id}/beds`, token);
      expect(own.status, role).toBe(200);
      expect(own.body.hospitalId).toBe(String(h1._id));
      const other = await get(`/hospitals/${h2._id}/beds`, token);
      expect(other.status, role).toBe(403);
      expect(other.body.error.code).toBe('HOSPITAL_MISMATCH');
    }
  });

  it('forces the token hospital when the route names none', async () => {
    const h1 = await makeHospital();
    const { token } = await loginAs(await makeUser({ role: 'hospital_staff', hospital: h1 }));
    const res = await get('/mine/beds', token);
    expect(res.body.hospitalId).toBe(String(h1._id));
  });

  it('lets central admins reach any hospital, and keeps patients out', async () => {
    const h1 = await makeHospital();
    const admin = await loginAs(await makeUser({ role: 'central_admin' }));
    const res = await get(`/hospitals/${h1._id}/beds`, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.hospitalId).toBe(String(h1._id));

    const patient = await loginAs(await makeUser());
    expect((await get(`/hospitals/${h1._id}/beds`, patient.token)).status).toBe(403);
  });

  it('cannot be bypassed with a hospital id in the query string', async () => {
    const [h1, h2] = [await makeHospital('A'), await makeHospital('B')];
    const { token } = await loginAs(await makeUser({ role: 'hospital_staff', hospital: h1 }));
    const res = await get(`/mine/beds?hospitalId=${h2._id}`, token);
    expect(res.status).toBe(403);
  });
});

describe('feature 98: audit logs', () => {
  it('records record views once the response succeeds, and not when it fails', async () => {
    const hospital = await makeHospital();
    const doctorUser = await makeUser({ role: 'doctor', hospital });
    const { token } = await loginAs(doctorUser);
    await get('/records/HT-2026-0001', token);
    await get('/records-fail/HT-2026-0001', token);
    await settle();
    const views = await AuditLog.find({ action: 'record.view' }).lean();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ role: 'doctor', resourceType: 'patient', resourceId: 'HT-2026-0001', outcome: 'success' });
    expect(String(views[0].actor)).toBe(String(doctorUser._id));
    expect(String(views[0].hospitalId)).toBe(String(hospital._id));
    expect(views[0].createdAt).toBeInstanceOf(Date);
  });

  it('cannot be edited or deleted by anyone', async () => {
    const entry = await AuditLog.create({ action: 'x.test' });
    entry.action = 'changed';
    await expect(entry.save()).rejects.toThrow(/append-only/);
    await expect(AuditLog.updateOne({ _id: entry._id }, { action: 'changed' })).rejects.toThrow(/append-only/);
    await expect(AuditLog.findOneAndUpdate({ _id: entry._id }, { action: 'changed' })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteOne({ _id: entry._id })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    expect((await AuditLog.findById(entry._id)).action).toBe('x.test');
  });

  describe('GET /api/audit-logs', () => {
    it('is for central admins only', async () => {
      const hospital = await makeHospital();
      for (const role of ['patient', 'doctor', 'hospital_staff', 'hospital_admin']) {
        const { token } = await loginAs(await makeUser({ role, hospital: ['patient'].includes(role) ? undefined : hospital }));
        expect((await agent().get('/api/audit-logs').set(bearer(token))).status, role).toBe(403);
      }
      expect((await agent().get('/api/audit-logs')).status).toBe(401);
    });

    it('filters by role, action, outcome, resource, text and date, with paging', async () => {
      const hospital = await makeHospital();
      const doctor = await makeUser({ role: 'doctor', hospital });
      const patient = await makeUser({ email: 'findme@test.example' });
      await loginAs(doctor);
      await loginAs(patient);
      await agent().post('/api/auth/login/patient').send({ identifier: patient.email, password: 'Wrong12345' });
      await AuditLog.create({ action: 'record.view', resourceType: 'patient', resourceId: 'HT-2026-0042', role: 'doctor', hospitalId: hospital._id });
      const admin = await loginAs(await makeUser({ role: 'central_admin' }));
      const list = (qs) => agent().get(`/api/audit-logs?${qs}`).set(bearer(admin.token));

      const all = await list('');
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(5);
      expect(all.body.items[0].createdAt >= all.body.items.at(-1).createdAt).toBe(true); // newest first

      expect((await list('role=doctor')).body.total).toBe(2);
      expect((await list('action=auth.login&outcome=failure')).body.total).toBe(1);
      expect((await list('resourceType=patient&resourceId=HT-2026-0042')).body.total).toBe(1);
      expect((await list(`hospitalId=${hospital._id}`)).body.total).toBe(2);
      expect((await list('actor=findme')).body.total).toBe(2);
      expect((await list(`from=${new Date(Date.now() + 60_000).toISOString()}`)).body.total).toBe(0);

      const page = await list('limit=2&page=2');
      expect(page.body).toMatchObject({ total: 5, page: 2, limit: 2, pages: 3 });
      expect(page.body.items).toHaveLength(2);
    });

    it('rejects bad filters and treats regex characters in text search literally', async () => {
      const admin = await loginAs(await makeUser({ role: 'central_admin' }));
      expect((await agent().get('/api/audit-logs?role=wizard').set(bearer(admin.token))).status).toBe(400);
      expect((await agent().get('/api/audit-logs?actor=.*').set(bearer(admin.token))).body.total).toBe(0);
    });

    it('exposes no way to change entries over HTTP', async () => {
      const admin = await loginAs(await makeUser({ role: 'central_admin' }));
      for (const method of ['post', 'put', 'patch', 'delete']) {
        const res = await request(realApp)[method]('/api/audit-logs').set(bearer(admin.token)).send({});
        expect(res.status, method).toBe(404);
      }
    });
  });
});
