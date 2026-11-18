import { assertSafeTestDb } from './dbGuard.js';

// Uses MONGO_URI_TEST when set (CI, or any local mongod); otherwise starts an in-memory MongoDB.
export default async function setup() {
  if (process.env.MONGO_URI_TEST) {
    assertSafeTestDb(process.env.MONGO_URI_TEST);
    return undefined;
  }
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    process.env.MONGO_URI_TEST = server.getUri('healthtwin_test');
    return async () => { await server.stop(); };
  } catch (err) {
    throw new Error(`No test database. Set MONGO_URI_TEST=mongodb://127.0.0.1:27017/healthtwin_test or allow mongodb-memory-server to download MongoDB. (${err.message})`);
  }
}
