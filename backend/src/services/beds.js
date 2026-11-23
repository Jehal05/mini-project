import mongoose from 'mongoose';
import { EVENTS, appEvents } from '../events.js';
import { Bed } from '../models/Bed.js';

const TYPES = ['general', 'icu', 'ccu'];
const STATUSES = ['vacant', 'occupied', 'cleaning', 'reserved'];

/**
 * Feature 85, for Puneet's hospital capability card (58):
 *   { general: { total, vacant, occupied, cleaning, reserved }, icu: {...}, ccu: {...}, totalVacant }
 */
export async function getBedAvailability(hospitalId) {
  const rows = await Bed.aggregate([
    { $match: { hospital: new mongoose.Types.ObjectId(String(hospitalId)) } },
    { $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const out = Object.fromEntries(TYPES.map((t) => [t, { total: 0, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) }]));
  for (const { _id, n } of rows) { out[_id.type][_id.status] = n; out[_id.type].total += n; }
  out.totalVacant = TYPES.reduce((sum, t) => sum + out[t].vacant, 0);
  return out;
}

/** Tells listeners (the live push to the hospital room) that counts changed. Never throws. */
export async function announceBeds(hospitalId) {
  try {
    appEvents.emit(EVENTS.BEDS_CHANGED, { hospitalId: String(hospitalId), availability: await getBedAvailability(hospitalId) });
  } catch (err) {
    console.error('[beds] announce failed', err.message);
  }
}
