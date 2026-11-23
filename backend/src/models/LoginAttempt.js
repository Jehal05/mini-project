import mongoose from 'mongoose';

/**
 * Failed-login counter used for the lockout. Keyed by account (or, for identifiers that match no
 * account, by a hash of the identifier) so a locked real account and a made-up one look identical.
 * Updated only with atomic operators, so parallel guesses cannot dodge the count.
 */
const loginAttemptSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, default: 0 },
    lockedUntil: Date,
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttempt = mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', loginAttemptSchema);
