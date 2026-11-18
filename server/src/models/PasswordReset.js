import mongoose from 'mongoose';

const { Schema } = mongoose;

const passwordResetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const PasswordReset = mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema);
