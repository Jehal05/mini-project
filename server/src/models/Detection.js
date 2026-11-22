// OWNER: Daksh (rule-based detection). Minimal stub.
import mongoose from 'mongoose';

const detectionSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    severity: { type: String, enum: ['low', 'moderate', 'high', 'critical'], required: true },
    riskScore: Number,
    reasons: [String],
    detectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.models.Detection || mongoose.model('Detection', detectionSchema);
