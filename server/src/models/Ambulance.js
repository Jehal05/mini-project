// Ambulance model: type, home hospital, crew, availability status and live location.
import mongoose from 'mongoose';
import { pointSchema } from './geo.js';

export const AMBULANCE_TYPES = ['BLS', 'ALS'];
export const AMBULANCE_STATUSES = ['available', 'dispatched', 'on_trip', 'maintenance'];

const crewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true }, // e.g. driver, paramedic
  },
  { _id: false }
);

const ambulanceSchema = new mongoose.Schema(
  {
    vehicleNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: AMBULANCE_TYPES, required: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    crew: { type: [crewSchema], default: [] },
    status: { type: String, enum: AMBULANCE_STATUSES, default: 'available' },
    location: { type: pointSchema, required: true },
  },
  { timestamps: true }
);

ambulanceSchema.index({ location: '2dsphere' });
ambulanceSchema.index({ hospital: 1, status: 1 });

export const Ambulance = mongoose.model('Ambulance', ambulanceSchema);
