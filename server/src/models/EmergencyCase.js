// EmergencyCase model: one cardiac emergency from detection to closure, with its full timeline.
import mongoose from 'mongoose';
import { pointSchema } from './geo.js';
import { nextSequence } from './Counter.js';

export const CASE_SOURCES = ['auto', 'sos', 'bystander'];
export const CASE_STATUSES = [
  'pending',
  'notified',
  'accepted',
  'dispatched',
  'picked_up',
  'arrived',
  'closed',
  'cancelled',
];

const rejectionSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    reason: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const timelineSchema = new mongoose.Schema(
  {
    stage: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    by: { type: String, trim: true }, // user id, "system", "simulation", etc.
  },
  { _id: false }
);

const emergencyCaseSchema = new mongoose.Schema(
  {
    caseId: { type: String, unique: true }, // EC-YYYY-NNNN, generated automatically
    // The Patient model is built by another teammate; the ref works once it exists.
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    severity: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
      validate: { validator: Number.isInteger, message: 'severity must be 1, 2 or 3' },
    },
    source: { type: String, enum: CASE_SOURCES, required: true },
    status: { type: String, enum: CASE_STATUSES, default: 'pending' },
    patientLocation: { type: pointSchema, required: true },
    notifiedHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
    rejections: { type: [rejectionSchema], default: [] },
    ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance', default: null },
    timeline: { type: [timelineSchema], default: [] },
    symptoms: { type: [String], default: [] },
  },
  { timestamps: true }
);

emergencyCaseSchema.index({ patientLocation: '2dsphere' });
emergencyCaseSchema.index({ status: 1, createdAt: -1 });

// Generate EC-YYYY-NNNN from an atomic counter so two cases never share an ID.
emergencyCaseSchema.pre('validate', async function assignCaseId() {
  if (this.caseId) return;
  const year = new Date().getFullYear();
  const seq = await nextSequence(`emergencyCase-${year}`);
  this.caseId = `EC-${year}-${String(seq).padStart(4, '0')}`;
});

export const EmergencyCase = mongoose.model('EmergencyCase', emergencyCaseSchema);
