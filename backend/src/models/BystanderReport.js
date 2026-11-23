import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Feature 106: someone who scanned a QR passport reports an emergency for that person.
 * Daksh's SOS flow consumes the `emergency:bystander_report` event (see src/events.js) and moves `status` on.
 */
const bystanderReportSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    location: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      accuracyMeters: { type: Number, min: 0 },
    },
    status: { type: String, enum: ['pending', 'handed_off', 'dismissed'], default: 'pending', index: true },
    reporterIp: String,
  },
  { timestamps: { createdAt: 'reportedAt', updatedAt: false } },
);

export const BystanderReport = mongoose.models.BystanderReport || mongoose.model('BystanderReport', bystanderReportSchema);
