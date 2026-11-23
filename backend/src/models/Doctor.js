import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Feature 83: a doctor of one hospital. `user` is set when the doctor has a login. "Cardiologist on duty" feeds ranking (59) and assignment (68). */
const doctorSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    specialization: { type: String, required: true, trim: true, maxlength: 80 },
    isCardiologist: { type: Boolean, default: false },
    phone: { type: String, trim: true },
    onDuty: { type: Boolean, default: false },
    dutyChangedAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
doctorSchema.index({ user: 1 }, { unique: true, sparse: true });
doctorSchema.index({ hospital: 1, onDuty: 1, isCardiologist: 1 });
doctorSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema);
