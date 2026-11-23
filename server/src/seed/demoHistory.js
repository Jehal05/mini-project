import { pathToFileURL } from 'node:url';
// Feature 96 demo data: about 60 SIMULATED closed cases over the last 30 days so the dashboard has charts.
// Idempotent: it deletes the previously generated history (marked simulatedHistory) and writes it again.
// It never touches real cases. Usage: npm run seed:demo-history (run npm run seed first).
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { Hospital, Ambulance, EmergencyCase, Trip, Patient, User } from '../models/index.js';
import { buildHistory } from './historyData.js';
import { nextSequence } from '../models/Counter.js';

// Made-up people for the demo history: name, blood group, date of birth.
const HISTORY_PATIENTS = [
  ['Ramesh Kulkarni', 'B+', '1961-03-14'], ['Sunita Deshmukh', 'O+', '1968-07-22'], ['Abdul Rahman Sheikh', 'A+', '1957-11-05'],
  ['Lakshmi Iyer', 'AB+', '1964-01-30'], ['Prakash Joshi', 'O-', '1955-09-18'], ['Meena Gaikwad', 'B-', '1971-05-09'],
  ['Harpreet Singh', 'A-', '1959-12-02'], ['Savita Patil', 'O+', '1966-04-27'], ['Dinesh Agarwal', 'B+', '1952-08-11'],
  ['Nisha Menon', 'A+', '1974-02-19'], ['Vijay Thorat', 'AB-', '1960-10-06'], ['Farida Khan', 'O+', '1969-06-15'],
];

export async function seedDemoHistory({ count = 60, days = 30, now = Date.now() } = {}) {
  const [hospitals, ambulances] = await Promise.all([Hospital.find().select('_id').lean(), Ambulance.find().select('_id homeHospital').lean()]);
  if (hospitals.length < 3) throw new Error('Run "npm run seed" first: at least 3 hospitals are needed.');

  // Twelve made-up patients, so the history reads like a real hospital's. They are not real people and their accounts cannot log in.
  const patients = [];
  for (const [i, [fullName, bloodGroup, dob]] of HISTORY_PATIENTS.entries()) {
    const user = await User.findOneAndUpdate(
      { email: `history-patient-${i + 1}@example.invalid` },
      { $setOnInsert: { name: fullName, passwordHash: '!disabled', role: 'patient' } },
      { upsert: true, new: true },
    );
    let p = await Patient.findOne({ user: user._id }).lean();
    if (!p) p = (await Patient.create({ user: user._id, fullName, bloodGroup, dateOfBirth: new Date(dob) })).toObject();
    const $set = { fullName, bloodGroup, dateOfBirth: new Date(dob) };
    if (!p.patientId) { const y = new Date(now).getFullYear(); $set.patientId = `HT-${y}-${String(await nextSequence(`patientId:${y}`)).padStart(4, '0')}`; }
    await Patient.updateOne({ _id: p._id }, { $set });
    patients.push(p._id);
  }
  // Earlier versions used one placeholder patient; its cases are replaced below, so the placeholder can go.
  await Patient.deleteMany({ fullName: 'Simulated history patient' });
  await User.deleteMany({ email: 'history-demo@example.invalid' });

  const old = await EmergencyCase.find({ simulatedHistory: true }).select('_id').lean();
  await Trip.deleteMany({ emergencyCase: { $in: old.map((c) => c._id) } });
  await EmergencyCase.deleteMany({ simulatedHistory: true });

  const { cases, trips } = buildHistory({
    hospitals, ambulances, patientIds: patients, now, count, days, newId: () => new mongoose.Types.ObjectId(),
  });
  await EmergencyCase.insertMany(cases);
  if (trips.length) await Trip.insertMany(trips);
  return { replaced: old.length, cases: cases.length, trips: trips.length };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  (async () => {
    try {
      await connectDB();
      console.log('[seed:demo-history] done (simulated data):', await seedDemoHistory());
    } catch (err) {
      console.error('[seed:demo-history] failed:', err.message);
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
