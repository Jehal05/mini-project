// PLACEHOLDER Patient model, until Jehal's real schema (features 1-20) is merged.
//
// It holds only the fields the simulation engine reads, named as in the feature
// plan. TODO(Jehal): when your model lands, follow "Swapping in the real Patient
// model" in docs/phase5-monitoring.md and delete this file. The engine reads
// patients through computeBaseline()/riskFactors(), which accept the likely field
// names (cardiacConditions|cardiacHistory, conditions|existingConditions; items as
// strings or objects with type|name|condition).

import mongoose from 'mongoose'

const { Schema } = mongoose

const patientSchema = new Schema(
  {
    patientCode: { type: String, required: true, unique: true, match: /^HT-\d{4}-\d{4}$/ },
    name: { type: String, required: true },
    dateOfBirth: Date,
    gender: String,
    bloodGroup: { type: String, enum: ['A+', 'A-', 'A−', 'B+', 'B-', 'B−', 'AB+', 'AB-', 'AB−', 'O+', 'O-', 'O−'] },
    city: String,
    cardiacConditions: [{ _id: false, type: { type: String }, year: Number }], // feature 13
    conditions: [String], // feature 14
    fitnessLevel: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    fictional: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true },
)

// Lets attachSimulation() warn loudly while this placeholder is the model in use (review item 12).
patientSchema.statics.isHealthTwinPlaceholder = true

export const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema)
export default Patient
