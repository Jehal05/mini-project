// Connects to MongoDB with Mongoose and reports the live connection state.
import mongoose from 'mongoose';

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set. Copy .env.example to .env and fill it in.');
  }

  mongoose.connection.on('connected', () => console.log('[db] MongoDB connected'));
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('[db] MongoDB error:', err.message));

  // Fail fast (10 s) instead of hanging when MongoDB is unreachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

export function dbStatus() {
  // readyState 1 = connected
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
