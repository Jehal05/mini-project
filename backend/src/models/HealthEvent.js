// HealthEvent: things that happen to a patient, shown on the health timeline
// (feature 30) alongside the readings. Phase 5 writes monitoring_started,
// scenario_change and status_change; later phases add detection, sos and admission.

import mongoose from 'mongoose'

const { Schema } = mongoose

export const HEALTH_EVENT_TYPES = Object.freeze([
  'monitoring_started',
  'scenario_change',
  'status_change',
  'detection', // Phase 6
  'sos', // Phase 7
  'emergency', // Phase 7
  'admission', // Jehal, feature 84
  'note',
])

const healthEventSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    type: { type: String, enum: HEALTH_EVENT_TYPES, required: true },
    at: { type: Date, default: Date.now, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ['info', 'normal', 'warning', 'critical'], default: 'info' },
    actorRole: String,
    actorId: String,
    data: Schema.Types.Mixed,
  },
  { versionKey: false },
)

healthEventSchema.index({ patient: 1, at: -1 })
healthEventSchema.index({ patient: 1, type: 1, at: -1 })

export const HealthEvent = mongoose.models.HealthEvent || mongoose.model('HealthEvent', healthEventSchema)
export default HealthEvent
