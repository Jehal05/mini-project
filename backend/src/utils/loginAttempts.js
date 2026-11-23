import { config } from '../config/env.js';
import { LoginAttempt } from '../models/LoginAttempt.js';
import { sha256 } from './crypto.js';

export const attemptKey = (user, normalizedIdentifier) => (user ? `u:${user._id}` : `i:${sha256(normalizedIdentifier)}`);

/**
 * Reserves one login attempt *before* the password is checked, with a single atomic increment.
 * At most `maxFailures` attempts can ever be in flight per account, however many requests arrive at once.
 * Returns { locked: true } once the limit is passed.
 */
export async function reserveAttempt(key) {
  const { maxFailures, lockMs } = config.lockout;
  const now = new Date();

  // An elapsed lock is cleared exactly once (the filter makes the update atomic).
  await LoginAttempt.updateOne({ _id: key, lockedUntil: { $lte: now } }, { $set: { count: 0 }, $unset: { lockedUntil: '' } });

  let doc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      doc = await LoginAttempt.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 }, $set: { expiresAt: new Date(now.getTime() + lockMs * 2) } },
        { upsert: true, returnDocument: 'after' },
      );
      break;
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw err; // two first-ever upserts racing
    }
  }

  if (doc.lockedUntil && doc.lockedUntil > now) return { locked: true };
  if (doc.count > maxFailures) {
    await LoginAttempt.updateOne({ _id: key, lockedUntil: { $exists: false } }, { $set: { lockedUntil: new Date(now.getTime() + lockMs) } });
    return { locked: true };
  }
  return { locked: false };
}

export const clearAttempts = (key) => LoginAttempt.deleteOne({ _id: key });
