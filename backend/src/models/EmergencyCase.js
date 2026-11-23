// EmergencyCase: one emergency from detection or SOS to admission (Daksh, Phase 1 contract).
//
// Created by the detection engine at Level 3 (feature 39), by the SOS button (41)
// or by a bystander QR scan (106). Puneet's hospital discovery, notification and
// ambulance features and Jehal's admission feature all write to this one document,
// so every portal reads the same case. Field owners are noted in comments.

import mongoose from 'mongoose'
import {
  CASE_SOURCE,
  CASE_STATUS,
  ACTIVE_STATUSES,
  CANCEL_REASONS,
  REJECT_REASONS,
  HOSPITAL_RESPONSE,
  LOCATION_SOURCES,
  ESCALATION,
} from '../../../shared/emergency.js'
import { STATUS } from '../../../shared/vitals.js'

const { Schema } = mongoose
const ObjectId = Schema.Types.ObjectId

// --- Sub-documents ---------------------------------------------------------

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number], // [longitude, latitude], GeoJSON order
      required: true,
      validate: {
        validator: (c) => c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
        message: 'coordinates must be [longitude, latitude]',
      },
    },
  },
  { _id: false },
)

// Feature 46: live patient location, kept updated during the emergency.
const locationSchema = new Schema(
  {
    point: { type: pointSchema, required: true },
    accuracyM: { type: Number, min: 0 }, // accuracy circle on the map
    source: { type: String, enum: LOCATION_SOURCES, default: 'gps' },
    address: String,
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

// Features 34, 39, 40: what fired and the readings at that moment.
const detectionSchema = new Schema(
  {
    rulesFired: [
      {
        _id: false,
        rule: { type: String, required: true }, // rule id from the detection rule table, e.g. 'multi:tachycardia-hypoxia'
        level: Number, // severity level the rule produces (1-3)
        vital: String,
        value: Number,
        threshold: Number,
        message: String,
      },
    ],
    snapshot: { hr: Number, sys: Number, dia: Number, spo2: Number, temp: Number, rr: Number },
    statuses: { type: Map, of: { type: String, enum: Object.values(STATUS) } },
    scenario: String,
    riskScore: { type: Number, min: 0, max: 100 }, // feature 93
    riskBreakdown: [{ _id: false, factor: String, points: Number }],
  },
  { _id: false },
)

// Feature 43: "Are you okay?" answers, sent to the hospital with the case.
const symptomsSchema = new Schema(
  {
    chestPain: Boolean,
    upperBodyPain: Boolean,
    shortnessOfBreath: Boolean,
    nauseaOrLightheaded: Boolean,
    answeredAt: Date,
    noResponse: { type: Boolean, default: false }, // countdown ran out (feature 44)
  },
  { _id: false },
)

// Features 44, 45: countdown and search rounds.
const escalationSchema = new Schema(
  {
    confirmDeadline: Date,
    autoSent: { type: Boolean, default: false },
    round: { type: Number, min: 0, max: ESCALATION.RADII_KM.length, default: 0 },
    radiusKm: { type: Number, default: ESCALATION.RADII_KM[0] },
    roundStartedAt: Date,
    centralAdminAlertedAt: Date,
  },
  { _id: false },
)

// Features 59-61, 65, 66: one row per hospital notified. [Puneet]
const hospitalResponseSchema = new Schema(
  {
    hospital: { type: ObjectId, ref: 'Hospital', required: true },
    round: { type: Number, min: 1, required: true },
    rank: Number,
    score: Number,
    distanceKm: Number,
    notifiedAt: { type: Date, default: Date.now },
    status: { type: String, enum: Object.values(HOSPITAL_RESPONSE), default: HOSPITAL_RESPONSE.NOTIFIED },
    rejectReason: { type: String, enum: REJECT_REASONS },
    rejectNote: String,
    respondedAt: Date,
    respondedBy: { type: ObjectId, ref: 'User' },
  },
  { _id: false },
)

// Feature 47: alerts sent to emergency contacts.
const contactAlertSchema = new Schema(
  {
    name: String,
    relation: String,
    phone: String,
    email: String,
    channels: [{ type: String, enum: ['email', 'push', 'whatsapp'] }],
    statusLinkToken: String, // live-status link for family (the token is the credential)
    whatsappLink: String, // pre-filled wa.me link the patient can tap
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

// Feature 48: who has tapped "Seen" and when.
const acknowledgementSchema = new Schema(
  {
    recipientType: {
      type: String,
      enum: ['patient', 'contact', 'hospital_staff', 'doctor', 'crew', 'central_admin'],
      required: true,
    },
    recipientId: String, // user id, or contact phone/email for family
    name: String,
    seenAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

// Feature 49
const cancellationSchema = new Schema(
  {
    reason: { type: String, enum: CANCEL_REASONS, required: true },
    note: String,
    cancelledAt: { type: Date, default: Date.now },
    cancelledBy: { type: ObjectId, ref: 'User' },
    afterAcceptance: { type: Boolean, default: false }, // hospital informed, ambulance released
  },
  { _id: false },
)

// Feature 70: every timestamp from detection to admission, shown in all three portals.
const timelineEventSchema = new Schema(
  {
    type: { type: String, required: true }, // e.g. 'detection', 'sos', 'confirmed', 'hospital_notified', 'accepted'
    at: { type: Date, default: Date.now },
    actorRole: String,
    actorId: String,
    message: String,
    data: Schema.Types.Mixed,
  },
  { _id: false },
)

// --- Case ------------------------------------------------------------------

const emergencyCaseSchema = new Schema(
  {
    caseNumber: { type: String, unique: true, sparse: true }, // e.g. EC-2026-0001, from the counters collection
    patient: { type: ObjectId, ref: 'Patient', required: true },
    patientCode: String, // HT-2026-0001, denormalised for display

    source: { type: String, enum: Object.values(CASE_SOURCE), required: true },
    severity: { type: Number, enum: [1, 2, 3], default: 3 },
    status: {
      type: String,
      enum: Object.values(CASE_STATUS),
      default: CASE_STATUS.AWAITING_CONFIRMATION,
      required: true,
    },

    detection: detectionSchema, // [Daksh]
    detectionRef: { type: ObjectId, ref: 'Detection' }, // feature 40 history entry
    symptoms: symptomsSchema, // [Daksh]
    location: locationSchema, // [Daksh 46 with Puneet 51]
    escalation: { type: escalationSchema, default: () => ({}) }, // [Daksh]

    hospitalResponses: [hospitalResponseSchema], // [Puneet]
    acceptedHospital: { type: ObjectId, ref: 'Hospital' }, // [Puneet 65]
    acceptedAt: Date,
    acceptedBy: { type: ObjectId, ref: 'User' },
    assignedDoctor: { type: ObjectId, ref: 'Doctor' }, // [Puneet 68]
    ambulance: { type: ObjectId, ref: 'Ambulance' }, // [Puneet 73]
    preparation: {
      // [Puneet 69]
      edBayReady: { type: Boolean, default: false },
      cathLabTeamAlerted: { type: Boolean, default: false },
      ccuBedReserved: { type: Boolean, default: false },
      ecgReadyOnArrival: { type: Boolean, default: false },
    },
    admission: { type: ObjectId, ref: 'Admission' }, // [Jehal 84]

    contactAlerts: [contactAlertSchema], // [Daksh 47]
    acknowledgements: [acknowledgementSchema], // [Daksh 48]
    cancellation: cancellationSchema, // [Daksh 49]
    timeline: [timelineEventSchema], // [all, feature 70]

    closedAt: Date,
    simulated: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true },
)

emergencyCaseSchema.index({ patient: 1, createdAt: -1 }) // feature 50: patient's incident history
emergencyCaseSchema.index({ status: 1, severity: -1, createdAt: 1 }) // feature 95: queues
emergencyCaseSchema.index({ 'hospitalResponses.hospital': 1, createdAt: -1 }) // feature 90
emergencyCaseSchema.index({ 'location.point': '2dsphere' }) // command-centre map
emergencyCaseSchema.index({ 'contactAlerts.statusLinkToken': 1 }, { sparse: true }) // family status link (feature 47/48)

// One live case per patient (feature 39, and the SOS button in feature 41 must join it
// rather than open a second). The database enforces it, so two server processes or two
// simultaneous detections cannot both open a case. Needs MongoDB 6.0+ (a partial index
// with $in); on 5.x the index is skipped with a warning and detection still prevents
// duplicates inside one process.
export const ONE_ACTIVE_CASE_INDEX = 'one_active_case_per_patient'
emergencyCaseSchema.index(
  { patient: 1 },
  { unique: true, name: ONE_ACTIVE_CASE_INDEX, partialFilterExpression: { status: { $in: [...ACTIVE_STATUSES] } } },
)

// Feature 49: a cancelled case must carry a reason. A path validator (not a hook)
// so it also runs in validateSync().
emergencyCaseSchema.path('status').validate(function requireCancelReason(status) {
  if (status === CASE_STATUS.CANCELLED && !this.cancellation?.reason) {
    this.invalidate('cancellation.reason', 'A cancelled case needs a reason')
  }
  return true
})

// --- Methods ---------------------------------------------------------------

emergencyCaseSchema.virtual('isActive').get(function isActive() {
  return ACTIVE_STATUSES.includes(this.status)
})

/** Append a timeline event (feature 70). Call save() afterwards. */
emergencyCaseSchema.methods.addEvent = function addEvent(type, { message, actorRole, actorId, data } = {}) {
  this.timeline.push({ type, message, actorRole, actorId, data, at: new Date() })
  return this
}

/** Feature 48: record "Seen" once per recipient. Call save() afterwards. */
emergencyCaseSchema.methods.acknowledge = function acknowledge({ recipientType, recipientId, name }) {
  const already = this.acknowledgements.some((a) => a.recipientType === recipientType && a.recipientId === recipientId)
  if (!already) this.acknowledgements.push({ recipientType, recipientId, name, seenAt: new Date() })
  return !already
}

/**
 * Feature 65: the query and update for "first hospital to accept wins".
 * The filter only matches while the case is still searching and this hospital
 * holds a live notification, so two simultaneous accepts cannot both succeed.
 */
export function buildAcceptOperation(caseId, hospitalId, userId, now = new Date()) {
  return {
    filter: {
      _id: caseId,
      status: CASE_STATUS.SEARCHING,
      hospitalResponses: { $elemMatch: { hospital: hospitalId, status: HOSPITAL_RESPONSE.NOTIFIED } },
    },
    update: {
      $set: {
        status: CASE_STATUS.ACCEPTED,
        acceptedHospital: hospitalId,
        acceptedAt: now,
        acceptedBy: userId,
        'hospitalResponses.$[mine].status': HOSPITAL_RESPONSE.ACCEPTED,
        'hospitalResponses.$[mine].respondedAt': now,
        'hospitalResponses.$[mine].respondedBy': userId,
        'hospitalResponses.$[others].status': HOSPITAL_RESPONSE.SUPERSEDED,
      },
      $push: { timeline: { type: 'accepted', at: now, actorRole: 'hospital_staff', actorId: String(userId), data: { hospital: String(hospitalId) } } },
    },
    options: {
      returnDocument: 'after',
      arrayFilters: [
        { 'mine.hospital': hospitalId, 'mine.status': HOSPITAL_RESPONSE.NOTIFIED },
        { 'others.hospital': { $ne: hospitalId }, 'others.status': HOSPITAL_RESPONSE.NOTIFIED },
      ],
    },
  }
}

/** Returns the updated case, or null if another hospital accepted first or the case is no longer searching. */
emergencyCaseSchema.statics.acceptIfPending = function acceptIfPending(caseId, hospitalId, userId) {
  const { filter, update, options } = buildAcceptOperation(caseId, hospitalId, userId)
  return this.findOneAndUpdate(filter, update, options)
}

emergencyCaseSchema.set('toJSON', { virtuals: true })

export const EmergencyCase = mongoose.models.EmergencyCase || mongoose.model('EmergencyCase', emergencyCaseSchema)
const CANNOT_CREATE_INDEX = 67
EmergencyCase.on('index', (err) => {
  if (err?.code === CANNOT_CREATE_INDEX) console.warn(`[EmergencyCase] could not build an index (${err.message}). The one-active-case-per-patient guard needs MongoDB 6.0+.`)
})
export default EmergencyCase
