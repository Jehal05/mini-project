import mongoose from 'mongoose';

export const ROLES = Object.freeze(['patient', 'doctor', 'hospital_staff', 'hospital_admin', 'central_admin']);
export const HOSPITAL_ROLES = Object.freeze(['doctor', 'hospital_staff', 'hospital_admin']);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // email/phone are left undefined (never null) when absent so the sparse unique indexes work.
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    // Staff accounts are tied to exactly one hospital (feature 5).
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

userSchema.pre('validate', function checkInvariants() {
  if (!this.email && !this.phone) this.invalidate('email', 'An email or phone number is required');
  const needsHospital = HOSPITAL_ROLES.includes(this.role);
  if (needsHospital && !this.hospitalId) this.invalidate('hospitalId', `${this.role} accounts must belong to a hospital`);
  if (!needsHospital && this.hospitalId) this.invalidate('hospitalId', `${this.role} accounts cannot belong to a hospital`);
});

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
