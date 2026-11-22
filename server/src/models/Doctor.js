import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    specialty: { type: String, enum: ['cardiologist', 'emergency', 'other'], default: 'other' },
    onDuty: { type: Boolean, default: false },
    simulated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

doctorSchema.index({ hospital: 1, name: 1 }, { unique: true });

export default mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema);
