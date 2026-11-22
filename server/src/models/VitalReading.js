// OWNER: Daksh (simulated monitoring). Minimal stub: simulated data only, not a medical device.
import mongoose from 'mongoose';

const vitalReadingSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    heartRate: Number,
    systolic: Number,
    diastolic: Number,
    spo2: Number,
    temperature: Number,
    respiratoryRate: Number,
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

export default mongoose.models.VitalReading || mongoose.model('VitalReading', vitalReadingSchema);
