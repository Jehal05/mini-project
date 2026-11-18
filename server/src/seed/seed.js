import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { connectDb, disconnectDb } from '../config/db.js';
import { config } from '../config/env.js';
import { Counter, Hospital, Patient, User } from '../models/index.js';
import { randomToken } from '../utils/crypto.js';

export const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Demo@12345';

// Fictional demo data only. Phase 3 (hospital management) extends the hospital list to 5 Pune hospitals.
export const DEMO_HOSPITAL = {
  name: 'HealthTwin Demo Heart Hospital (fictional)',
  address: 'Shivajinagar, Pune, Maharashtra',
  city: 'Pune',
  phone: '+912000000000',
  location: { type: 'Point', coordinates: [73.8474, 18.5308] }, // [lng, lat]
  capabilities: { cathLab: true, icuBeds: 10, ccuBeds: 6, cardiologist24x7: true, alsAmbulances: 2 },
};

export const DEMO_ACCOUNTS = [
  { name: 'Central Admin (demo)', email: 'admin@healthtwin.example', role: 'central_admin' },
  { name: 'Dr. Meera Kulkarni (demo)', email: 'doctor@healthtwin.example', role: 'doctor', hospital: true },
  { name: 'Anil Patil (demo staff)', email: 'staff@healthtwin.example', role: 'hospital_staff', hospital: true },
  { name: 'Hospital Admin (demo)', email: 'hospitaladmin@healthtwin.example', role: 'hospital_admin', hospital: true },
];

export async function seed({ log = console.log } = {}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds);

  const hospital = await Hospital.findOneAndUpdate({ name: DEMO_HOSPITAL.name }, { $setOnInsert: DEMO_HOSPITAL }, { upsert: true, returnDocument: 'after' });

  for (const acct of DEMO_ACCOUNTS) {
    const existing = await User.findOne({ email: acct.email });
    if (existing) { log(`= ${acct.role.padEnd(15)} ${acct.email} (already there)`); continue; }
    await User.create({ name: acct.name, email: acct.email, role: acct.role, passwordHash, ...(acct.hospital && { hospitalId: hospital._id }) });
    log(`+ ${acct.role.padEnd(15)} ${acct.email}`);
  }

  // Rahul Sharma, the final-demo patient: HT-2026-0001, age 45, B+, previous cardiac condition, Pune.
  const rahulEmail = 'rahul.sharma@example.com';
  let rahulUser = await User.findOne({ email: rahulEmail });
  if (!rahulUser) {
    rahulUser = await User.create({ name: 'Rahul Sharma', email: rahulEmail, phone: '+919876500001', role: 'patient', passwordHash });
    await Counter.updateOne({ _id: 'patientId:2026' }, { $max: { seq: 1 } }, { upsert: true }); // so the next sign-up becomes 0002
    await Patient.create({
      patientId: 'HT-2026-0001',
      user: rahulUser._id,
      fullName: 'Rahul Sharma',
      dateOfBirth: new Date('1981-03-14'),
      gender: 'male',
      address: 'Kothrud, Pune',
      city: 'Pune',
      bloodGroup: 'B+',
      consent: { dataUse: true, location: true },
      emergencyContacts: [{ name: 'Priya Sharma (fictional)', relation: 'Spouse', phone: '+919876500002', email: 'priya.sharma@example.com', priority: 1 }],
      cardiacConditions: [{ type: 'Previous cardiac condition', year: 2022 }],
      qrToken: randomToken(32),
    });
    log('+ patient         rahul.sharma@example.com  (HT-2026-0001)');
  } else {
    log('= patient         rahul.sharma@example.com (already there)');
  }
  log(`\nDemo password for every seeded account: ${DEMO_PASSWORD}  (fictional data, development only)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (config.isProd) { console.error('Refusing to seed demo accounts in production.'); process.exit(1); }
  await connectDb();
  await seed();
  await disconnectDb();
}
