import mongoose from 'mongoose';

// One row per refresh token. Only a SHA-256 hash is stored. All tokens from one login share a `family`;
// ending the family ends every access token minted for that login.
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true, default: Date.now },
    revokedAt: Date,
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema);
