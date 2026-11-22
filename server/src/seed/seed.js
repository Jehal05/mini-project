// Idempotent: safe to run repeatedly. Records are upserted by a natural key, never duplicated.
// Usage: npm run seed
import { connectDB, disconnectDB } from '../config/db.js';
import { Hospital, Doctor, Bed, Ambulance } from '../models/index.js';
import { hospitals, doctors, ambulances } from './data.js';

export async function seed() {
  const byCode = {};

  for (const h of hospitals) {
    const doc = await Hospital.findOneAndUpdate(
      { code: h.code },
      {
        $set: {
          name: h.name,
          area: h.area,
          address: `${h.area}, Pune (simulated)`,
          location: { type: 'Point', coordinates: h.coords },
          capabilities: { cathLab: h.cathLab, cardiologistOnDuty: h.cardiologist },
          simulated: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    byCode[h.code] = { doc, spec: h };
  }

  for (const { doc, spec } of Object.values(byCode)) {
    const beds = [
      ...Array.from({ length: spec.icu }, (_, i) => ({ ward: 'ICU', label: `ICU-${i + 1}` })),
      ...Array.from({ length: spec.ccu }, (_, i) => ({ ward: 'CCU', label: `CCU-${i + 1}` })),
    ];
    for (const b of beds) {
      // $setOnInsert keeps a bed's status if it was changed after the first seed.
      await Bed.updateOne(
        { hospital: doc._id, label: b.label },
        { $set: { ward: b.ward, simulated: true }, $setOnInsert: { status: 'free' } },
        { upsert: true },
      );
    }
  }

  for (const d of doctors) {
    const hospital = byCode[d.hospitalCode].doc;
    await Doctor.updateOne(
      { hospital: hospital._id, name: d.name },
      { $set: { specialty: d.specialty, onDuty: d.onDuty, simulated: true } },
      { upsert: true },
    );
  }

  for (const a of ambulances) {
    const hospital = byCode[a.hospitalCode].doc;
    await Ambulance.updateOne(
      { vehicleNumber: a.vehicleNumber },
      {
        $set: {
          type: a.type,
          homeHospital: hospital._id,
          location: hospital.location,
          crew: [
            { name: 'Demo Paramedic', role: 'paramedic' },
            { name: 'Demo Driver', role: 'driver' },
          ],
          equipment: a.type === 'ALS' ? ['defibrillator', 'ECG monitor', 'oxygen'] : ['oxygen', 'first aid kit'],
          simulated: true,
        },
        $setOnInsert: { status: 'available' },
      },
      { upsert: true },
    );
  }

  return {
    hospitals: await Hospital.countDocuments(),
    beds: await Bed.countDocuments(),
    doctors: await Doctor.countDocuments(),
    ambulances: await Ambulance.countDocuments(),
  };
}

// Run only when executed directly (npm run seed), not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await connectDB();
      await Hospital.init(); // make sure the 2dsphere index exists
      const counts = await seed();
      console.log('[seed] done (simulated data):', counts);
    } catch (err) {
      console.error('[seed] failed:', err.message);
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
