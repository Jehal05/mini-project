// VitalReading: one saved simulated reading for one patient (Daksh, Phase 1 contract).
//
// The simulation engine ticks every 2 s and emits `vitals:update` over Socket.IO;
// it saves a VitalReading every 30 s so history survives a reload (feature 28).
// Every reading is simulated, and the schema enforces it.

import mongoose from 'mongoose'
import { readingStatuses, worstStatus, STATUS } from '../../../shared/vitals.js'
import { SCENARIOS } from '../../../shared/emergency.js'

const { Schema } = mongoose
const STATUS_VALUES = Object.values(STATUS)

const vital = (min, max) => ({ type: Number, min, max })

const vitalReadingSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    recordedAt: { type: Date, default: Date.now, required: true },

    hr: { ...vital(0, 300), required: true }, // BPM
    sys: vital(0, 300), // mmHg
    dia: vital(0, 200), // mmHg
    spo2: vital(0, 100), // %
    temp: vital(25, 45), // °C
    rr: vital(0, 80), // breaths/min

    scenario: { type: String, enum: SCENARIOS, default: 'stable' },

    // Feature 29: per-vital status and the patient's worst status at this moment.
    statuses: {
      hr: { type: String, enum: STATUS_VALUES },
      sys: { type: String, enum: STATUS_VALUES },
      dia: { type: String, enum: STATUS_VALUES },
      spo2: { type: String, enum: STATUS_VALUES },
      temp: { type: String, enum: STATUS_VALUES },
      rr: { type: String, enum: STATUS_VALUES },
    },
    status: { type: String, enum: STATUS_VALUES, default: STATUS.NORMAL },

    // Honest claims: every reading is simulated. Cannot be set to false or changed.
    simulated: {
      type: Boolean,
      default: true,
      immutable: true,
      validate: { validator: (v) => v === true, message: 'Readings in HealthTwin AI are always simulated' },
    },
  },
  { timestamps: false, versionKey: false },
)

// History queries: latest first per patient (features 28, 30, 91).
vitalReadingSchema.index({ patient: 1, recordedAt: -1 })

/**
 * Review item 11: readings expire after VITALS_RETENTION_DAYS (default 30).
 * Never below 8 days, so the 7-day graph always has full data.
 * Note: MongoDB keeps an existing TTL index as created; to change the period on a
 * database that already has it, run collMod or drop the index (see docs/phase5-monitoring.md).
 */
export const MIN_RETENTION_DAYS = 8
export const DEFAULT_RETENTION_DAYS = 30

export function retentionDays(env = process.env) {
  const n = Number.parseInt(env.VITALS_RETENTION_DAYS ?? '', 10)
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS
  return Math.max(MIN_RETENTION_DAYS, n)
}

vitalReadingSchema.index({ recordedAt: 1 }, { expireAfterSeconds: retentionDays() * 24 * 3600, name: 'vitals_ttl' })

// Fill statuses from the default thresholds when the engine has not set them.
// The engine should pass statuses computed with the admin's current thresholds (feature 36).
vitalReadingSchema.pre('validate', function fillStatuses() {
  const hasStatuses = this.statuses && Object.values(this.statuses.toObject?.() ?? this.statuses).some(Boolean)
  if (!hasStatuses) {
    this.statuses = readingStatuses(this)
    this.status = worstStatus(this)
  }
})

vitalReadingSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.label = 'Simulated'
    return ret
  },
})

vitalReadingSchema.statics.latestFor = function latestFor(patientId) {
  return this.findOne({ patient: patientId }).sort({ recordedAt: -1 })
}

/** Readings in a window, oldest first, ready for Recharts. */
vitalReadingSchema.statics.rangeFor = function rangeFor(patientId, from, to = new Date()) {
  return this.find({ patient: patientId, recordedAt: { $gte: from, $lte: to } }).sort({ recordedAt: 1 })
}

export const VitalReading = mongoose.models.VitalReading || mongoose.model('VitalReading', vitalReadingSchema)
export default VitalReading
