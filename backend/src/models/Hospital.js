import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Hospital record (Jehal owns the schema; Puneet queries it with $near on `location`, feature 53).
 * Phase 3 adds the registration screen, beds and roster that keep `capabilities` live.
 */
const hospitalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, default: 'Pune' },
    phone: { type: String, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point', required: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: [
          (c) => c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
          'location.coordinates must be [longitude, latitude]',
        ],
      },
    },
    capabilities: {
      cathLab: { type: Boolean, default: false },
      icuBeds: { type: Number, min: 0, default: 0 },
      ccuBeds: { type: Number, min: 0, default: 0 },
      cardiologist24x7: { type: Boolean, default: false },
      alsAmbulances: { type: Number, min: 0, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

hospitalSchema.index({ location: '2dsphere' });
hospitalSchema.index({ name: 1 }, { unique: true });

hospitalSchema.set('toJSON', { transform: (_d, ret) => { delete ret.__v; return ret; } });

export const Hospital = mongoose.models.Hospital || mongoose.model('Hospital', hospitalSchema);
