import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
export default Counter;

/** Atomically adds one and returns the new value. One $inc upsert is race-free; the retry covers two first-ever upserts colliding. */
export async function nextSequence(key) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return doc.seq;
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
}
