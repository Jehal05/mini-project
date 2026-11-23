import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/** Per-IP limiter (off in tests unless RATE_LIMIT=on). Limits that must be exact use utils/quota.js instead. */
export const limiter = (max, windowMs = 15 * 60 * 1000) =>
  config.rateLimitEnabled
    ? rateLimit({ windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Try again later.' } } })
    : (_req, _res, next) => next();
