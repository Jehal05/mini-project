import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/services/caseRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/alternatives.js', async () => {
  const f = await import('./helpers/fakeDb.js');
  return { prepareCandidates: f.prepareCandidates, markNotified: f.markNotified, nextHospital: f.nextHospital };
});
vi.mock('../src/services/ambulanceRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/tripRepo.js', async () => await import('./helpers/fakeDb.js'));
vi.mock('../src/services/push.js', () => ({ pushToHospital: vi.fn(async () => ({ sent: 0 })) }));

import app from '../src/app.js';
import { db, resetDb, seedCase, oid } from './helpers/fakeDb.js';

const [H1, H2] = [oid(1), oid(2)];
const [D1, D2] = [oid(901), oid(902)];
const as = (id) => ({ 'x-doctor-id': id });

beforeEach(() => {
  resetDb();
  db.doctors.set(D1, { _id: D1, name: 'Dr. Asha Rao', hospital: H1, specialty: 'cardiologist', onDuty: true });
  db.doctors.set(D2, { _id: D2, name: 'Dr. Vikram Shah', hospital: H2, specialty: 'emergency', onDuty: true });
});

describe('GET /api/doctors/:id/cases', () => {
  it('returns only the cases assigned to that doctor, most urgent first', async () => {
    const low = seedCase({ status: 'accepted', hospital: H1, doctor: D1, severity: 'moderate', riskScore: 40 });
    const crit = seedCase({ status: 'accepted', hospital: H1, doctor: D1, severity: 'critical', riskScore: 90 });
    seedCase({ status: 'accepted', hospital: H2, doctor: D2 }); // another doctor's case
    seedCase({ status: 'accepted', hospital: H1 }); // nobody assigned
    seedCase({ status: 'pending', hospital: H1, doctor: D1 }); // not active yet

    const res = await request(app).get(`/api/doctors/${D1}/cases`).set(as(D1));
    expect(res.status).toBe(200);
    expect(res.body.doctor).toMatchObject({ id: D1, name: 'Dr. Asha Rao', hospitalId: H1 });
    expect(res.body.results.map((c) => c.id)).toEqual([crit, low]);
    expect(res.body.count).toBe(2);
    expect(res.body.results[0].notice).toMatch(/Not a medical device/);
  });

  it('refuses another doctor, and a missing or malformed login', async () => {
    expect((await request(app).get(`/api/doctors/${D1}/cases`).set(as(D2))).status).toBe(403);
    expect((await request(app).get(`/api/doctors/${D1}/cases`)).status).toBe(401);
    expect((await request(app).get(`/api/doctors/${D1}/cases`).set(as('nope'))).status).toBe(401);
  });

  it('returns an empty list, not an error, when nothing is assigned', async () => {
    const res = await request(app).get(`/api/doctors/${D2}/cases`).set(as(D2));
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('404s for a doctor that does not exist', async () => {
    const ghost = oid(999);
    expect((await request(app).get(`/api/doctors/${ghost}/cases`).set(as(ghost))).status).toBe(404);
  });
});

describe('GET /api/doctors/dev-options', () => {
  it('lists doctors with their hospital for the demo login', async () => {
    const res = await request(app).get('/api/doctors/dev-options');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0]).toMatchObject({ id: expect.any(String), hospitalId: expect.any(String), hospitalName: expect.stringContaining('Hospital') });
  });
});
