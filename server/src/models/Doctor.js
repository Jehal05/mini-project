import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    specialty: { type: String, enum: ['cardiologist', 'emergency', 'other'], default: 'other' },
    phone: { type: String, trim: true },
    onDuty: { type: Boolean, default: false },
    dutyChangedAt: Date,
    isActive: { type: Boolean, default: true }, // Phase 17: a doctor who left is switched off, not deleted (their notes keep a name)
    simulated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

doctorSchema.index({ hospital: 1, name: 1 }, { unique: true });

export default mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema);
