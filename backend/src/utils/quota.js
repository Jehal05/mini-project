import { Quota } from '../models/Quota.js';

/**
 * Atomically counts one use of `key` in a fixed window and says whether it is still within `limit`.
 * One update (an aggregation-pipeline upsert) does the whole read-modify-write, so parallel requests
 * cannot slip past the limit. Returns { allowed, count, retryAfterSeconds }.
 */
export async function consumeQuota(key, limit, windowMs) {
  const expired = { $gt: [{ $subtract: ['$$NOW', { $ifNull: ['$windowStart', new Date(0)] }] }, windowMs] };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const doc = await Quota.findOneAndUpdate(
        { _id: key },
        [
          // Decide once whether this call opens a new window; comparing timestamps later would misfire when two calls share a millisecond.
          { $set: { fresh: { $or: [{ $eq: [{ $type: '$windowStart' }, 'missing'] }, expired] } } },
          { $set: { windowStart: { $cond: ['$fresh', '$$NOW', '$windowStart'] }, count: { $cond: ['$fresh', 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] } } },
          { $set: { expiresAt: { $add: ['$windowStart', windowMs + 60_000] } } },
          { $unset: 'fresh' },
        ],
        { upsert: true, returnDocument: 'after', updatePipeline: true },
      );
      const retryAfterSeconds = Math.max(1, Math.ceil((doc.windowStart.getTime() + windowMs - Date.now()) / 1000));
      return { allowed: doc.count <= limit, count: doc.count, retryAfterSeconds };
    } catch (err) {
      if (err?.code !== 11000 || attempt === 7) throw err; // two first-ever upserts racing
    }
  }
  throw new Error('unreachable');
}
