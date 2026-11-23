import mongoose from 'mongoose';

/** Fixed-window counters for limits that must hold under parallel requests (see utils/quota.js). */
const quotaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

quotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Quota = mongoose.models.Quota || mongoose.model('Quota', quotaSchema);
