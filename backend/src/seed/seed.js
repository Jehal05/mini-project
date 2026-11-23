import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { connectDb, disconnectDb } from '../config/db.js';
import { config } from '../config/env.js';
import { Bed, Counter, Doctor, Document, EdBay, Hospital, HospitalCase, Patient, User } from '../models/index.js';
import { randomToken } from '../utils/crypto.js';
import { deleteFile, saveFile } from '../utils/storage.js';

export const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Demo@12345';

// Fictional demo data only. The 5 Pune hospitals (feature 81) are this one plus OTHER_HOSPITALS below.
export const DEMO_HOSPITAL = {
  name: 'HealthTwin Demo Heart Hospital (fictional)',
  address: 'Shivajinagar, Pune, Maharashtra',
  city: 'Pune',
  phone: '+912000000000',
  location: { type: 'Point', coordinates: [73.8474, 18.5308] }, // [lng, lat]
  capabilities: { cathLab: true, icuBeds: 10, ccuBeds: 6, cardiologist24x7: true, alsAmbulances: 2 },
};

export const OTHER_HOSPITALS = [
  { name: 'Deccan Heart Institute (fictional)', address: 'Deccan Gymkhana, Pune, Maharashtra', city: 'Pune', phone: '+912000000001', location: { type: 'Point', coordinates: [73.8412, 18.5167] }, capabilities: { cathLab: true, icuBeds: 8, ccuBeds: 4, cardiologist24x7: true, alsAmbulances: 1 } },
  { name: 'Kothrud Multispeciality Hospital (fictional)', address: 'Kothrud, Pune, Maharashtra', city: 'Pune', phone: '+912000000002', location: { type: 'Point', coordinates: [73.8077, 18.5074] }, capabilities: { cathLab: false, icuBeds: 6, ccuBeds: 2, cardiologist24x7: false, alsAmbulances: 1 } },
  { name: 'Hadapsar Care Hospital (fictional)', address: 'Hadapsar, Pune, Maharashtra', city: 'Pune', phone: '+912000000003', location: { type: 'Point', coordinates: [73.926, 18.5089] }, capabilities: { cathLab: true, icuBeds: 6, ccuBeds: 3, cardiologist24x7: false, alsAmbulances: 2 } },
  { name: 'Pimpri Cardiac Centre (fictional)', address: 'Pimpri, Pimpri-Chinchwad, Maharashtra', city: 'Pune', phone: '+912000000004', location: { type: 'Point', coordinates: [73.8009, 18.6279] }, capabilities: { cathLab: true, icuBeds: 10, ccuBeds: 5, cardiologist24x7: true, alsAmbulances: 2 } },
];

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
            qrToken: randomToken(32),
    });
    log('+ patient         rahul.sharma@example.com  (HT-2026-0001)');
  } else {
    log('= patient         rahul.sharma@example.com (already there)');
  }
  await seedHospitals(hospital, log);
  await seedRahulProfile(log);
  log(`\nDemo password for every seeded account: ${DEMO_PASSWORD}  (fictional data, development only)`);
}

const DEMO_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/** Phase 2: Rahul's full medical profile. Each part is added only if it is still empty, so re-running never duplicates or overwrites edits. */
export async function seedRahulProfile(log = console.log) {
  const patient = await Patient.findOne({ patientId: 'HT-2026-0001' });
  if (!patient) return;
  const fill = async (field, value, label) => {
    const done = await Patient.updateOne({ _id: patient._id, [`${field}.0`]: { $exists: false } }, { $set: { [field]: value } });
    if (done.modifiedCount) log(`+ profile         ${label}`);
  };
  await fill('cardiacConditions', [{ type: 'stent', year: 2022, notes: 'Drug-eluting stent in the LAD artery' }], 'cardiac: stent (2022)');
  await fill('medicalConditions', [{ name: 'Hypertension' }, { name: 'Type 2 diabetes' }], 'conditions');
  await fill('allergies', [{ allergen: 'Penicillin', reaction: 'Anaphylaxis', severity: 'severe' }, { allergen: 'Pollen', reaction: 'Sneezing', severity: 'mild' }], 'allergies (severe: penicillin)');
  await fill('medications', [{ drug: 'Clopidogrel', dose: '75 mg', frequency: 'Once daily' }, { drug: 'Atorvastatin', dose: '20 mg', frequency: 'Night' }], 'medications (blood thinner: clopidogrel)');
  await fill('hospitalizations', [{ hospital: 'City Care Hospital, Pune (fictional)', admittedOn: new Date('2022-06-10'), dischargedOn: new Date('2022-06-16'), reason: 'Chest pain, stent placement' }], 'hospitalization (2022)');
  await fill('familyHistory', [{ relative: 'Father', condition: 'Heart attack', ageAtDiagnosis: 50 }], 'family history');

  const hasDoc = await Document.exists({ patient: patient._id });
  if (!hasDoc) {
    const storedName = await saveFile('documents', DEMO_PDF, 'pdf');
    try {
      await Document.create({ patient: patient._id, type: 'ecg', originalName: 'ecg-june-2022 (demo).pdf', storedName, mimeType: 'application/pdf', size: DEMO_PDF.length });
      await Counter.updateOne({ _id: `documents:${patient._id}` }, { $max: { seq: 1 } }, { upsert: true });
      log('+ profile         document: ECG (demo PDF)');
    } catch (err) {
      await deleteFile('documents', storedName);
      throw err;
    }
  }
}

/** Phase 3: 5 Pune hospitals, each with beds, doctors and ED bays; the demo hospital also gets sample cases. Re-runnable: each part is added only if missing. */
export async function seedHospitals(demoHospital, log = console.log) {
  const hospitals = [demoHospital];
  for (const data of OTHER_HOSPITALS) {
    const h = await Hospital.findOneAndUpdate({ name: data.name }, { $setOnInsert: data }, { upsert: true, returnDocument: 'after' });
    hospitals.push(h);
  }
  for (const h of hospitals) {
    const cap = h.capabilities;
    if (!(await Bed.exists({ hospital: h._id }))) {
      const make = (type, prefix, n) => Array.from({ length: n }, (_, i) => ({ hospital: h._id, type, label: `${prefix}-${i + 1}` }));
      const beds = [...make('general', 'GEN', 12), ...make('icu', 'ICU', cap.icuBeds), ...make('ccu', 'CCU', cap.ccuBeds)];
      await Bed.insertMany(beds);
      await Counter.updateOne({ _id: `beds:${h._id}` }, { $max: { seq: beds.length } }, { upsert: true });
      log(`+ beds            ${h.name}: ${beds.length}`);
    }
    if (!(await EdBay.exists({ hospital: h._id }))) {
      await EdBay.insertMany(['ED-1', 'ED-2', 'ED-3', 'ED-4'].map((label) => ({ hospital: h._id, label })));
      await Counter.updateOne({ _id: `edbays:${h._id}` }, { $max: { seq: 4 } }, { upsert: true });
    }
    if (!(await Doctor.exists({ hospital: h._id }))) {
      const first = h._id.equals(demoHospital._id) ? await User.findOne({ email: 'doctor@healthtwin.example' }) : null;
      await Doctor.insertMany([
        { hospital: h._id, fullName: first ? 'Dr. Meera Kulkarni (demo)' : `Dr. A. Joshi (fictional, ${h.name.split(' ')[0]})`, specialization: 'Cardiology', isCardiologist: true, onDuty: true, user: first?._id, dutyChangedAt: new Date() },
        { hospital: h._id, fullName: `Dr. S. Khan (fictional, ${h.name.split(' ')[0]})`, specialization: 'Emergency medicine', isCardiologist: false, onDuty: true, dutyChangedAt: new Date() },
        { hospital: h._id, fullName: `Dr. R. Rao (fictional, ${h.name.split(' ')[0]})`, specialization: 'Cardiology', isCardiologist: true, onDuty: false, dutyChangedAt: new Date() },
      ]);
    }
  }
  if (!(await HospitalCase.exists({ hospital: demoHospital._id }))) {
    const now = Date.now();
    const min = (m) => new Date(now - m * 60_000);
    await HospitalCase.insertMany([
      { hospital: demoHospital._id, emergencyCaseId: 'DEMO-CASE-001', patientId: 'HT-2026-0001', summary: 'Suspected heart attack, 45 M (demo)', severity: 'critical', status: 'accepted', receivedAt: min(6), respondedAt: min(5), etaMinutes: 9 },
      { hospital: demoHospital._id, emergencyCaseId: 'DEMO-CASE-002', summary: 'Chest pain, 62 F (demo)', severity: 'high', status: 'received', receivedAt: min(1) },
      { hospital: demoHospital._id, emergencyCaseId: 'DEMO-CASE-003', summary: 'Arrhythmia, 58 M (demo)', severity: 'high', status: 'closed', receivedAt: min(300), respondedAt: min(298), arrivedAt: min(280), closedAt: min(120), outcome: 'Discharged' },
      { hospital: demoHospital._id, emergencyCaseId: 'DEMO-CASE-004', summary: 'Fainting, 70 M (demo)', severity: 'moderate', status: 'rejected', receivedAt: min(600), respondedAt: min(597), rejectionReason: 'No ICU bed free at the time' },
    ]);
    log('+ cases           4 demo cases at the demo hospital');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (config.isProd) { console.error('Refusing to seed demo accounts in production.'); process.exit(1); }
  await connectDb();
  await seed();
  await disconnectDb();
}
