import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Feature 86: an emergency-department bay. */
const edBaySchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    status: { type: String, enum: ['vacant', 'occupied', 'cleaning'], default: 'vacant' },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient' },
    patientId: String,
    triageLevel: { type: Number, min: 1, max: 5 }, // 1 = resuscitation ... 5 = non-urgent
    complaint: { type: String, trim: true, maxlength: 200 },
    occupiedAt: Date,
  },
  { timestamps: true },
);
edBaySchema.index({ hospital: 1, label: 1 }, { unique: true });
edBaySchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r; } });

export const EdBay = mongoose.models.EdBay || mongoose.model('EdBay', edBaySchema);
