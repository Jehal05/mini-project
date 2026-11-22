import mongoose from 'mongoose';

const bedSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    ward: { type: String, enum: ['ICU', 'CCU', 'ED', 'GENERAL'], required: true },
    label: { type: String, required: true },
    status: { type: String, enum: ['free', 'occupied', 'reserved'], default: 'free' },
    simulated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

bedSchema.index({ hospital: 1, label: 1 }, { unique: true });

export default mongoose.models.Bed || mongoose.model('Bed', bedSchema);
