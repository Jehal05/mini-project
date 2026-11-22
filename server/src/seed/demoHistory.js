// Feature 96 demo data: about 60 SIMULATED closed cases over the last 30 days so the dashboard has charts.
// Idempotent: it deletes the previously generated history (marked simulatedHistory) and writes it again.
// It never touches real cases. Usage: npm run seed:demo-history (run npm run seed first).
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { Hospital, Ambulance, EmergencyCase, Trip, Patient, User } from '../models/index.js';
import { buildHistory } from './historyData.js';

export async function seedDemoHistory({ count = 60, days = 30, now = Date.now() } = {}) {
  const [hospitals, ambulances] = await Promise.all([Hospital.find().select('_id').lean(), Ambulance.find().select('_id homeHospital').lean()]);
  if (hospitals.length < 3) throw new Error('Run "npm run seed" first: at least 3 hospitals are needed.');

  // One placeholder patient for every generated case. Not a real person, and the account cannot log in.
  const user = await User.findOneAndUpdate(
    { email: 'history-demo@example.invalid' },
    { $setOnInsert: { name: 'Simulated history patient', passwordHash: '!disabled', role: 'patient' } },
    { upsert: true, new: true },
  );
  const patient = await Patient.findOneAndUpdate(
    { user: user._id },
    { $setOnInsert: { user: user._id, fullName: 'Simulated history patient' } },
    { upsert: true, new: true },
  );

  const old = await EmergencyCase.find({ simulatedHistory: true }).select('_id').lean();
  await Trip.deleteMany({ emergencyCase: { $in: old.map((c) => c._id) } });
  await EmergencyCase.deleteMany({ simulatedHistory: true });

  const { cases, trips } = buildHistory({
    hospitals, ambulances, patientId: patient._id, now, count, days, newId: () => new mongoose.Types.ObjectId(),
  });
  await EmergencyCase.insertMany(cases);
  if (trips.length) await Trip.insertMany(trips);
  return { replaced: old.length, cases: cases.length, trips: trips.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
