// Detection: one entry in the emergency detection history (feature 40).
//
// Written by the detection engine each time a patient's severity level rises
// (Watch -> Urgent -> Critical), with a snapshot of the readings, the rules that fired
// and, later, the outcome. Detections of one stretch of abnormal readings share an `episode`.

import mongoose from 'mongoose'
import { DETECTION_OUTCOME } from '../../../shared/detection.js'
import { STATUS } from '../../../shared/vitals.js'

const { Schema } = mongoose

const detectionSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientCode: String,
    episode: { type: String, required: true }, // groups the detections of one abnormal stretch
    at: { type: Date, default: Date.now, required: true },
    severity: { type: Number, enum: [1, 2, 3], required: true },
    severityLabel: String, // 'Level 2 Urgent'
    primaryRule: String,
    rules: [
      {
        _id: false,
        rule: { type: String, required: true },
        level: Number,
        vital: String,
        value: Number,
        threshold: Number,
        message: String,
      },
    ],
    snapshot: { hr: Number, sys: Number, dia: Number, spo2: Number, temp: Number, rr: Number },
    statuses: { type: Map, of: { type: String, enum: Object.values(STATUS) } },
    scenario: String,
    riskScore: { type: Number, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'moderate', 'high'] },
    riskBreakdown: [{ _id: false, factor: String, points: Number }],
    outcome: { type: String, enum: Object.values(DETECTION_OUTCOME), default: DETECTION_OUTCOME.PENDING },
    case: { type: Schema.Types.ObjectId, ref: 'EmergencyCase' },
    simulated: { type: Boolean, default: true, immutable: true },
  },
  { versionKey: false },
)

detectionSchema.index({ patient: 1, at: -1 }) // the history list
detectionSchema.index({ episode: 1 })
detectionSchema.index({ outcome: 1, at: -1 })

export const Detection = mongoose.models.Detection || mongoose.model('Detection', detectionSchema)
export default Detection
