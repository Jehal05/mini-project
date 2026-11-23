import mongoose from 'mongoose';

const ambulanceSchema = new mongoose.Schema(
  {
    vehicleNumber: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ['BLS', 'ALS'], required: true },
    homeHospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    status: {
      type: String,
      enum: ['available', 'dispatched', 'on_trip', 'maintenance'],
      default: 'available',
    },
    crew: [{ name: String, role: String }],
    equipment: [String],
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    // Added in Phase 10: the case this ambulance is reserved for or serving. Null means free.
    // Claiming it is one atomic update, so two cases can never get the same ambulance (feature 73).
    currentCase: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase', default: null },
    simulated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

ambulanceSchema.index({ location: '2dsphere' });

export default mongoose.models.Ambulance || mongoose.model('Ambulance', ambulanceSchema);
