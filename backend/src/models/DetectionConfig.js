// DetectionConfig: the admin-editable detection settings (feature 36), one document.
// Holds only OVERRIDES; anything not set falls back to the shared defaults.

import mongoose from 'mongoose'

const { Schema } = mongoose

export const MAX_CHANGE_LOG = 50

const detectionConfigSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    thresholds: { type: Schema.Types.Mixed, default: {} },
    baselineLimits: { type: Schema.Types.Mixed, default: {} },
    riskWeights: { type: Schema.Types.Mixed, default: {} },
    patientThresholds: { type: Schema.Types.Mixed, default: {} }, // patient id -> threshold overrides (doctors)
    // Kept here until Jehal's audit log (feature 98) exists: who changed what, newest last.
    changes: [
      {
        _id: false,
        at: Date,
        actorRole: String,
        actorId: String,
        scope: String, // 'global' or 'patient:<id>'
        summary: String,
        before: Schema.Types.Mixed,
        after: Schema.Types.Mixed,
      },
    ],
  },
  { minimize: false, timestamps: true },
)

export const DetectionConfig = mongoose.models.DetectionConfig || mongoose.model('DetectionConfig', detectionConfigSchema)
export default DetectionConfig
