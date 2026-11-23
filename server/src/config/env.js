import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // Backup and restore (Phase 12, feature 99)
  backupDir: process.env.BACKUP_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backups'),
  backupKeep: Number(process.env.BACKUP_KEEP) || 14,
  backupEncryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '', // 64 hex characters. Required in production.
  allowProductionRestore: process.env.ALLOW_PRODUCTION_RESTORE === 'true',
  // Real login (Phase 14). Mirrors Jehal's design: 15 min access token in memory, rotating refresh cookie, 30 min idle limit.
  accessTtlSeconds: Number(process.env.ACCESS_TTL_SECONDS) || 15 * 60,
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS) || 7,
  idleTimeoutMinutes: Number(process.env.IDLE_TIMEOUT_MINUTES) || 30,
  maxFailedLogins: Number(process.env.MAX_FAILED_LOGINS) || 5,
  lockoutMinutes: Number(process.env.LOCKOUT_MINUTES) || 15,
  // The old x-hospital-id / x-doctor-id / x-ambulance-id / x-admin-token headers still work ONLY in tests or when DEV_AUTH=true. Never in production.
  devAuth: (process.env.NODE_ENV || 'development') === 'test' || ((process.env.NODE_ENV || 'development') !== 'production' && process.env.DEV_AUTH === 'true'),
  // Patient records (Phase 15)
  uploadsDir: process.env.UPLOADS_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads'),
  photoMaxBytes: 2 * 1024 * 1024,
  documentMaxBytes: 5 * 1024 * 1024,
  maxDocumentsPerPatient: 50,
  bloodThinnerDrugs: (process.env.BLOOD_THINNERS || 'warfarin,acenocoumarol,heparin,enoxaparin,apixaban,rivaroxaban,dabigatran,clopidogrel,ticagrelor,prasugrel').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  bystanderPerIpPerHour: Number(process.env.BYSTANDER_PER_IP_PER_HOUR) || 5,
  bystanderPerPatientPerHour: Number(process.env.BYSTANDER_PER_PATIENT_PER_HOUR) || 3,
  testAlertsPerContactPerHour: Number(process.env.TEST_ALERTS_PER_CONTACT_PER_HOUR) || 3,
  sweepIntervalSeconds: Number(process.env.NO_ANSWER_SWEEP_SECONDS) || 5,
};
