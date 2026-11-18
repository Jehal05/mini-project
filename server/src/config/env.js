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

export const config = Object.freeze({
  env,
  isProd,
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/healthtwin',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  trustProxy: process.env.TRUST_PROXY === 'true',

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

  mail: {
    provider: process.env.MAIL_PROVIDER || 'console', // 'console' | 'resend'
    from: process.env.MAIL_FROM || 'HealthTwin AI <no-reply@healthtwin.example>',
    resendApiKey: process.env.RESEND_API_KEY || '',
  },

  rateLimitEnabled: !isTest,
});
