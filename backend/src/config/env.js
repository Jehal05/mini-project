import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isTest = env === 'test';

function secret(name) {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProd) throw new Error(`${name} must be set to a random string of 32+ characters in production`);
  // Dev/test fallback only. Never used in production (the line above throws).
  return `dev-only-${name.toLowerCase()}-not-for-production-0123456789abcdef`;
}

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = Object.freeze({
  env,
  isProd,
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/healthtwin',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  trustProxy: process.env.TRUST_PROXY === 'true',
  // When set, the API also serves the built frontend from this folder (one process, one origin: no CORS, first-party cookies).
  staticDir: process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : '',

  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET'),
    issuer: 'healthtwin',
    accessTtl: '15m', // feature 100
  },

  session: {
    refreshTtlMs: 7 * 24 * 60 * 60 * 1000, // feature 100: refresh token lasts 7 days
    idleTimeoutMs: 30 * 60 * 1000, // feature 100: idle sessions end after 30 minutes
    cookieName: 'ht_refresh',
    cookiePath: '/api/auth',
    activityTouchMs: 60 * 1000, // throttle for "last seen" writes
  },

  passwordReset: {
    ttlMs: 15 * 60 * 1000, // feature 7: link expires in 15 minutes
  },

  lockout: {
    maxFailures: 5,
    lockMs: 15 * 60 * 1000,
  },

  bcryptRounds: isTest ? 4 : 12,

  // Uploaded photos and documents live outside any public folder and are served only through authenticated routes.
  uploads: {
    dir: path.resolve(process.env.UPLOAD_DIR || path.join(serverRoot, 'uploads')),
    photoMaxBytes: 2 * 1024 * 1024,
    documentMaxBytes: 5 * 1024 * 1024,
    maxDocumentsPerPatient: 50,
  },

  // Feature 16: drugs that are flagged as blood thinners automatically (lower-case, matched as whole words).
  bloodThinnerDrugs: (process.env.BLOOD_THINNER_DRUGS || 'warfarin,apixaban,rivaroxaban,dabigatran,clopidogrel,ticagrelor,prasugrel')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),

  // Feature 106: abuse limits for bystander reports (per hour).
  bystander: { perIpPerHour: 5, perPatientPerHour: 3 },
  // Feature 9: test alerts per contact per hour.
  testAlertsPerContactPerHour: 3,

  mail: {
    provider: process.env.MAIL_PROVIDER || 'console', // 'console' | 'resend'
    from: process.env.MAIL_FROM || 'HealthTwin AI <no-reply@healthtwin.example>',
    resendApiKey: process.env.RESEND_API_KEY || '',
  },

  rateLimitEnabled: process.env.RATE_LIMIT ? process.env.RATE_LIMIT === 'on' : !isTest,
});
