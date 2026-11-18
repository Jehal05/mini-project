import mongoose from 'mongoose';

const { Schema } = mongoose;

/** One row per issued refresh token. Only a SHA-256 hash is stored, never the token itself. */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true }, // all tokens descended from one login
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true, default: Date.now }, // drives the 30-minute idle rule
    revokedAt: Date,
    replacedBy: Schema.Types.ObjectId,
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }); // purge a day after expiry

export const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema);
