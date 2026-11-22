// OWNER: Daksh (case creation). Minimal stub. Puneet's modules (hospital notification, ambulance)
// read and update `status`, `hospital`, `ambulance` and `timeline`, so keep those names stable.
import mongoose from 'mongoose';

const emergencyCaseSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'ambulance_assigned', 'en_route', 'arrived', 'closed'],
      default: 'pending',
      index: true,
    },
    severity: { type: String, enum: ['low', 'moderate', 'high', 'critical'], default: 'high' },
    riskScore: Number,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance' },
    timeline: [{ event: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true },
);

export default mongoose.models.EmergencyCase || mongoose.model('EmergencyCase', emergencyCaseSchema);
