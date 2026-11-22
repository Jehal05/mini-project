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
  // Ambulance simulation (Phase 10)
  ambulanceSpeedKmh: Number(process.env.AMBULANCE_SPEED_KMH) || 60,
  ambulanceTickSeconds: Number(process.env.AMBULANCE_TICK_SECONDS) || 2,
  // Emergency prioritization (Phase 12). Order: risk,wait,distance. Normalised, so 5,3,2 works too.
  priorityWeights: process.env.PRIORITY_WEIGHTS || '0.5,0.3,0.2',
  priorityWaitCapMin: Number(process.env.PRIORITY_WAIT_CAP_MIN) || 30,
  priorityDistanceCapKm: Number(process.env.PRIORITY_DISTANCE_CAP_KM) || 20,
  // Admin dev login (Phase 12). Jehal replaces it with real admin auth.
  adminDevToken: process.env.ADMIN_DEV_TOKEN || '',
  sweepIntervalSeconds: Number(process.env.NO_ANSWER_SWEEP_SECONDS) || 5,
};
