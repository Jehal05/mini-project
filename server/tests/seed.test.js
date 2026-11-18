import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seed } from '../src/seed/seed.js';
import { Hospital, Patient, User } from '../src/models/index.js';
import { agent } from './helpers.js';

const quiet = { log: () => {} };

describe('demo seed', () => {
  it('creates one account per role, a demo hospital and Rahul Sharma as HT-2026-0001', async () => {
    await seed(quiet);
    expect(await User.countDocuments()).toBe(DEMO_ACCOUNTS.length + 1);
    expect((await User.distinct('role')).sort()).toEqual(['central_admin', 'doctor', 'hospital_admin', 'hospital_staff', 'patient']);

    const rahul = await Patient.findOne({ patientId: 'HT-2026-0001' });
    expect(rahul).toMatchObject({ fullName: 'Rahul Sharma', bloodGroup: 'B+', city: 'Pune' });
    expect(rahul.age).toBeGreaterThanOrEqual(44);
    expect(rahul.age).toBeLessThanOrEqual(46);
    expect(rahul.cardiacConditions).toHaveLength(1);
    expect(rahul.emergencyContacts).toHaveLength(1);
    expect(rahul.qrToken).toHaveLength(64);

    const staff = await User.findOne({ role: 'hospital_staff' });
    const hospital = await Hospital.findById(staff.hospitalId);
    expect(hospital.location.coordinates).toEqual([73.8474, 18.5308]);
  });

  it('can be run again without duplicating anything', async () => {
    await seed(quiet);
    await seed(quiet);
    expect(await User.countDocuments()).toBe(DEMO_ACCOUNTS.length + 1);
    expect(await Hospital.countDocuments()).toBe(1);
    expect(await Patient.countDocuments()).toBe(1);
  });

  it('seeded accounts can log in through their own portals', async () => {
    await seed(quiet);
    const cases = [
      ['patient', 'rahul.sharma@example.com'], ['doctor', 'doctor@healthtwin.example'],
      ['staff', 'staff@healthtwin.example'], ['staff', 'hospitaladmin@healthtwin.example'], ['admin', 'admin@healthtwin.example'],
    ];
    for (const [portal, identifier] of cases) {
      const res = await agent().post(`/api/auth/login/${portal}`).send({ identifier, password: DEMO_PASSWORD });
      expect(res.status, identifier).toBe(200);
    }
  });

  it('keeps Rahul\'s ID reserved so the next sign-up does not collide with it', async () => {
    await seed(quiet);
    const res = await agent().post('/api/auth/register').send({ fullName: 'Next Patient', email: 'next@example.com', password: 'Heart1234', consent: { dataUse: true } });
    expect(res.status).toBe(201);
    const year = new Date().getFullYear();
    expect(res.body.user.patient.patientId).toBe(year === 2026 ? 'HT-2026-0002' : `HT-${year}-0001`);
  });
});
