import mongoose from 'mongoose';

// Feature 106: someone who scanned a QR passport reports an emergency for that person.
const schema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    location: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      accuracyMeters: { type: Number, min: 0 },
    },
    status: { type: String, enum: ['pending', 'handed_off', 'dismissed'], default: 'pending', index: true },
  },
  { timestamps: { createdAt: 'reportedAt', updatedAt: false } },
);

export default mongoose.models.BystanderReport || mongoose.model('BystanderReport', schema);
