// OWNER: Jehal (hospital records). The geo index and capability flags are set up here
// because Puneet's hospital discovery ($near, features 53-59) depends on them.
import mongoose from 'mongoose';

const hospitalSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: String,
    area: String,
    phone: String,
    // GeoJSON point, coordinates are [longitude, latitude].
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    capabilities: {
      cathLab: { type: Boolean, default: false },
      cardiologistOnDuty: { type: Boolean, default: false },
    },
    simulated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

hospitalSchema.index({ location: '2dsphere' });

export default mongoose.models.Hospital || mongoose.model('Hospital', hospitalSchema);
