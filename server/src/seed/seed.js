// Seed script (npm run seed): clears hospitals and ambulances, then loads the fictional Pune demo data.
import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/db.js';
import { Hospital } from '../models/Hospital.js';
import { Ambulance } from '../models/Ambulance.js';
import { EmergencyCase } from '../models/EmergencyCase.js';
import { hospitals, ambulances } from './data.js';

async function seed() {
  await connectDB(process.env.MONGO_URI);

  // 1. Clear old demo data so the script can be run any number of times.
  const removedAmbulances = await Ambulance.deleteMany({});
  const removedHospitals = await Hospital.deleteMany({});
  console.log(
    `[seed] Cleared ${removedHospitals.deletedCount} hospitals and ${removedAmbulances.deletedCount} ambulances`
  );

  // 2. Make sure the 2dsphere indexes exist before any $near / $geoNear query.
  await Promise.all([Hospital.syncIndexes(), Ambulance.syncIndexes(), EmergencyCase.syncIndexes()]);

  // 3. Insert hospitals and keep a key -> _id map for the ambulances.
  const createdHospitals = await Hospital.insertMany(
    hospitals.map(({ key, ...rest }) => rest)
  );
  const idByKey = Object.fromEntries(hospitals.map((h, i) => [h.key, createdHospitals[i]._id]));
  const coordsByKey = Object.fromEntries(hospitals.map((h) => [h.key, h.location.coordinates]));

  // 4. Insert ambulances, each parked near its home hospital.
  const createdAmbulances = await Ambulance.insertMany(
    ambulances.map(({ hospitalKey, offset, ...rest }) => {
      const [lng, lat] = coordsByKey[hospitalKey];
      return {
        ...rest,
        hospital: idByKey[hospitalKey],
        status: 'available',
        location: { type: 'Point', coordinates: [lng + offset[0], lat + offset[1]] },
      };
    })
  );

  // 5. Keep each hospital's alsAmbulances count in line with the ambulances seeded.
  for (const [key, hospitalId] of Object.entries(idByKey)) {
    const alsCount = ambulances.filter((a) => a.hospitalKey === key && a.type === 'ALS').length;
    await Hospital.updateOne({ _id: hospitalId }, { $set: { 'capabilities.alsAmbulances': alsCount } });
  }

  console.log(`[seed] Inserted ${createdHospitals.length} hospitals and ${createdAmbulances.length} ambulances`);
  console.table(
    createdHospitals.map((h) => ({
      id: h._id.toString(),
      name: h.name,
      cathLab: h.capabilities.cathLab,
      ccuBedsFree: h.capabilities.ccuBedsFree,
    }))
  );
}

seed()
  .then(async () => {
    await disconnectDB();
    console.log('[seed] Done');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] Failed:', err.message);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
