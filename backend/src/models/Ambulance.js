import mongoose from 'mongoose'
import { AMBULANCE_STATUSES, AMBULANCE_TYPES, TRIP_STAGES } from '../../../shared/response.js'

const { Schema } = mongoose
const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true, validate: [(c) => c.length === 2 && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90, 'coordinates must be [longitude, latitude]'] },
  },
  { _id: false },
)

/** Features 71-80. One vehicle of one hospital; `trip` is its current job (simulated movement, labelled as such). */
const ambulanceSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    vehicleNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 20, unique: true },
    type: { type: String, enum: AMBULANCE_TYPES, default: 'BLS' },
    status: { type: String, enum: AMBULANCE_STATUSES, default: 'available' },
    crew: [{ _id: false, name: { type: String, trim: true, maxlength: 80 }, role: { type: String, trim: true, maxlength: 40 }, phone: { type: String, trim: true, maxlength: 20 } }],
    equipment: [{ type: String, trim: true, maxlength: 60 }],
    position: { type: pointSchema, required: true },
    trip: {
      caseId: String,
      stage: { type: String, enum: TRIP_STAGES },
      patientPoint: [Number],
      hospitalPoint: [Number],
      legFrom: [Number],
      legTo: [Number],
      legKm: Number, // road length of the current leg (a routed distance, or the straight line times a road factor)
      legPath: [[Number]], // the current leg as [lng, lat] points
      hospitalPath: [[Number]], // the leg from the patient to the hospital, planned at dispatch
      hospitalKm: Number,
      routeSource: { type: String, enum: ['road', 'estimate'] },
      progressKm: { type: Number, default: 0 },
      stageTimes: { type: Map, of: Date },
      dispatchedAt: Date,
    },
  },
  { timestamps: true },
)
ambulanceSchema.index({ hospital: 1, status: 1, type: 1 })
ambulanceSchema.index({ 'trip.caseId': 1 }, { sparse: true })
ambulanceSchema.set('toJSON', { transform: (_d, r) => { delete r.__v; return r } })

export const Ambulance = mongoose.models.Ambulance || mongoose.model('Ambulance', ambulanceSchema)
