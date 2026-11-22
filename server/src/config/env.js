import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/healthtwin',
  jwtSecret: process.env.JWT_SECRET || 'change-me-before-use',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Hospital discovery (Phase 8)
  routingProvider: (process.env.ROUTING_PROVIDER || 'osrm').toLowerCase(), // osrm | mapbox | google
  mapsApiKey: process.env.MAPS_API_KEY || '',
  osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
  noAnswerTimeoutSeconds: Number(process.env.NO_ANSWER_TIMEOUT_SECONDS) || 120,
  // Hospital notification (Phase 9). Web push is skipped when the VAPID keys are empty.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  sweepIntervalSeconds: Number(process.env.NO_ANSWER_SWEEP_SECONDS) || 5,
};
