// Creates demo login accounts for the seeded hospitals, a doctor, an ambulance and a patient. Safe to re-run.
// Usage: npm run seed:users      (password: DEMO_PASSWORD env, or the default below). Never runs in production.
import { connectDB, disconnectDB } from '../config/db.js';
import { Hospital, Doctor, Ambulance, Patient, User } from '../models/index.js';
import { hashPassword } from '../auth/password.js';
import crypto from 'node:crypto';
import { nextSequence } from '../models/Counter.js';

export const DEFAULT_DEMO_PASSWORD = 'HealthTwin#2026';

// Gives the first demo patient an HT id, a QR token and a small sample profile so the new screens are not empty. Never overwrites filled fields.
async function fillDemoProfile(p) {
  const $set = {};
  if (!p.patientId) { const y = new Date().getFullYear(); $set.patientId = `HT-${y}-${String(await nextSequence(`patientId:${y}`)).padStart(4, '0')}`; }
  if (!p.qrToken) $set.qrToken = crypto.randomBytes(32).toString('hex');
  if (!p.bloodGroup) $set.bloodGroup = 'B+';
  if (!p.dateOfBirth) $set.dateOfBirth = new Date('1978-04-12');
  if (!p.emergencyContacts?.length) $set.emergencyContacts = [{ name: 'Anita Sharma', relation: 'Spouse', phone: '+919800000001', priority: 1 }];
  if (!p.allergies?.length) $set.allergies = [{ allergen: 'Penicillin', reaction: 'Rash', severity: 'severe' }];
  if (!p.cardiacConditions?.length) $set.cardiacConditions = [{ type: 'stent', year: 2021 }];
  if (!p.medications?.length) $set.medications = [{ drug: 'Atorvastatin', dose: '20 mg', frequency: 'Once daily' }];
  if (Object.keys($set).length) await Patient.updateOne({ _id: p._id }, { $set });
  return { ...p, ...$set };
}

export async function seedUsers({ password = process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo accounts are never created in production');
  const passwordHash = await hashPassword(password);
  const made = [];
  const upsert = async (email, fields) => {
    await User.findOneAndUpdate({ email }, { $set: { ...fields, email, passwordHash, isActive: true } }, { upsert: true, setDefaultsOnInsert: true });
    made.push({ email, role: fields.role });
  };

  const hospital = await Hospital.findOne({ simulated: true }).sort({ name: 1 }).lean();
  const doctor = hospital ? await Doctor.findOne({ hospital: hospital._id, onDuty: true }).sort({ name: 1 }).lean() : null;
  const ambulance = hospital ? await Ambulance.findOne({ homeHospital: hospital._id }).sort({ vehicleNumber: 1 }).lean() : null;
  let patient = await Patient.findOne({}).sort({ createdAt: 1 }).lean();
  if (patient) patient = await fillDemoProfile(patient);

  await upsert('admin@healthtwin.demo', { name: 'Central Admin (demo)', role: 'central_admin' });
  if (hospital) {
    await upsert('staff@healthtwin.demo', { name: `Staff, ${hospital.name} (demo)`, role: 'hospital_staff', hospital: hospital._id });
    await upsert('hospitaladmin@healthtwin.demo', { name: `Admin, ${hospital.name} (demo)`, role: 'hospital_admin', hospital: hospital._id });
    if (doctor) await upsert('doctor@healthtwin.demo', { name: `${doctor.name} (demo)`, role: 'doctor', hospital: hospital._id, doctor: doctor._id });
    if (ambulance) await upsert('crew@healthtwin.demo', { name: `Crew, ${ambulance.vehicleNumber} (demo)`, role: 'ambulance_crew', hospital: hospital._id, ambulance: ambulance._id });
  }
  if (patient) await upsert('patient@healthtwin.demo', { name: `${patient.fullName ?? 'Patient'} (demo)`, role: 'patient', patient: patient._id });
  return made;
}

if (process.argv[1] && process.argv[1].endsWith('authUsers.js')) {
  await connectDB();
  try {
    const made = await seedUsers();
    console.log(`Demo accounts ready (password: ${process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD}):`);
    made.forEach((m) => console.log(`  ${m.role.padEnd(15)} ${m.email}`));
    if (!made.some((m) => m.role === 'doctor' || m.role === 'ambulance_crew')) console.log('Run npm run seed first so hospitals, doctors and ambulances exist.');
  } finally { await disconnectDB(); }
}
