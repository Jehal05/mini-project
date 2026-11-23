// OWNER: Jehal (auth and roles). Extended in Phase 14 for real login; existing fields keep their names.
import mongoose from 'mongoose';

import { ROLES } from '../auth/roles.js';
export { ROLES, HOSPITAL_ROLES } from '../auth/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'patient' },
    // Which record this account acts as. Staff and doctors belong to one hospital.
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance' },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    isActive: { type: Boolean, default: true },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.set('toJSON', { transform(_d, ret) { delete ret.passwordHash; delete ret.__v; return ret; } });

export default mongoose.models.User || mongoose.model('User', userSchema);
