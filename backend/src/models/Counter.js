import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { versionKey: false },
);

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/** Atomically increments and returns the next value. A single $inc upsert is race-free;
 *  the retry covers two first-ever upserts colliding on the same _id (E11000). */
export async function nextSequence(key) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const doc = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
      return doc.seq;
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
}
