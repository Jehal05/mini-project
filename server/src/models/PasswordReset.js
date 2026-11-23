import mongoose from 'mongoose';

// Feature 7: one row per reset link. Only a SHA-256 hash of the token is stored. Used once, valid 15 minutes.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default mongoose.models.PasswordReset || mongoose.model('PasswordReset', schema);
