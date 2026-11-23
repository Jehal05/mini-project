import { Counter } from '../models/Counter.js';
import { ApiError } from './ApiError.js';

/**
 * Reserves `n` of at most `max` slots under `key` in one atomic update, so a limit holds under parallel requests.
 * (When the counter has no room, the upsert collides with its own _id: that duplicate-key error means "full".)
 * Returns a function that gives the slots back, for when the work that needed them fails.
 */
export async function reserveSlots(key, n, max, fullMessage, code) {
  try {
    await Counter.findOneAndUpdate({ _id: key, seq: { $lte: max - n } }, { $inc: { seq: n } }, { upsert: true });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict(fullMessage, code);
    throw err;
  }
  return () => releaseSlots(key, n);
}

export const releaseSlots = (key, n = 1) => Counter.updateOne({ _id: key, seq: { $gte: n } }, { $inc: { seq: -n } });
