import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { connectDb } from '../src/config/db.js';
import { drainBackground } from '../src/utils/background.js';
import { assertSafeTestDb } from './dbGuard.js';

beforeAll(async () => {
  const uri = process.env.MONGO_URI_TEST;
  if (!uri) throw new Error('MONGO_URI_TEST is not set');
  assertSafeTestDb(uri);
  await connectDb(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
});

beforeEach(async () => {
  await drainBackground(); // late work from the previous test must not leak into this one
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
