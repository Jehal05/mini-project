import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seed } from '../../src/seed/seed.js';
import { Hospital, Patient, User } from '../../src/models/index.js';
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
    expect(await Hospital.countDocuments()).toBe(5);
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

describe('demo seed: Rahul\'s full profile', () => {
  it('has the stent, severe allergy, blood thinner, family history, hospitalization and a document', async () => {
    const { Document } = await import('../../src/models/index.js');
    const { getEmergencySummary, presentPatient } = await import('../../src/services/patientSummary.js');
    await seed(quiet);
    const rahul = await Patient.findOne({ patientId: 'HT-2026-0001' });
    expect(rahul.cardiacConditions.map((c) => [c.type, c.year])).toEqual([['stent', 2022]]);
    expect(rahul.familyHistory[0]).toMatchObject({ relative: 'Father', condition: 'Heart attack', ageAtDiagnosis: 50 });
    expect(rahul.hospitalizations).toHaveLength(1);
    expect(presentPatient(rahul).medications.some((m) => m.isBloodThinner)).toBe(true);
    expect((await getEmergencySummary(rahul)).severeAllergies[0].allergen).toBe('Penicillin');
    expect(await Document.countDocuments({ patient: rahul._id })).toBe(1);
  });

  it('can be re-run without duplicating, and keeps the patient\'s own edits', async () => {
    const { Document } = await import('../../src/models/index.js');
    await seed(quiet);
    await Patient.updateOne({ patientId: 'HT-2026-0001' }, { $push: { allergies: { allergen: 'Latex', severity: 'moderate' } } });
    await seed(quiet);
    await seed(quiet);
    const rahul = await Patient.findOne({ patientId: 'HT-2026-0001' });
    expect(rahul.allergies.map((a) => a.allergen)).toEqual(['Penicillin', 'Pollen', 'Latex']);
    expect(rahul.medications).toHaveLength(2);
    expect(await Document.countDocuments()).toBe(1);
  });
});
