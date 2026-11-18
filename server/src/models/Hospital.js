// Hospital model: location (2dsphere) plus the cardiac capabilities used for ranking.
import mongoose from 'mongoose';
import { pointSchema } from './geo.js';

const capabilitiesSchema = new mongoose.Schema(
  {
    cathLab: { type: Boolean, default: false },
    cardiologistOnDuty: { type: Boolean, default: false },
    icuBedsFree: { type: Number, default: 0, min: 0 },
    ccuBedsFree: { type: Number, default: 0, min: 0 },
    alsAmbulances: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    location: { type: pointSchema, required: true },
    capabilities: { type: capabilitiesSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Required for $near / $geoNear queries.
hospitalSchema.index({ location: '2dsphere' });

export const Hospital = mongoose.model('Hospital', hospitalSchema);
