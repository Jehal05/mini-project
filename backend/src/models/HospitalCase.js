import mongoose from 'mongoose';

const { Schema } = mongoose;
export const CASE_STATUSES = ['received', 'accepted', 'rejected', 'arrived', 'admitted', 'closed'];

/**
 * The hospital's side of an emergency: one row per case a hospital was notified about (features 82, 86, 90).
 * Puneet's notify / accept / reject flow writes these through `services/hospitalCases.js`; it never needs
 * to touch this file. `emergencyCaseId` is Daksh's EmergencyCase _id, kept as a plain id so there is no dependency on his model.
 */
const hospitalCaseSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    emergencyCaseId: { type: String, required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient' },
    patientId: String,
    summary: { type: String, trim: true, maxlength: 300 }, // e.g. "Suspected STEMI, 52 M"
    severity: { type: String, enum: ['critical', 'high', 'moderate', 'low'] },
    status: { type: String, enum: CASE_STATUSES, default: 'received' },
    receivedAt: { type: Date, default: Date.now },
    respondedAt: Date, // accepted or rejected
    etaMinutes: Number,
    arrivedAt: Date,
    closedAt: Date,
    rejectionReason: { type: String, trim: true, maxlength: 200 },
    outcome: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);
hospitalCaseSchema.index({ hospital: 1, emergencyCaseId: 1 }, { unique: true }); // a hospital hears about a case once
hospitalCaseSchema.index({ hospital: 1, status: 1, receivedAt: -1 });
hospitalCaseSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const HospitalCase = mongoose.models.HospitalCase || mongoose.model('HospitalCase', hospitalCaseSchema);
