// Persistence for detection, behind a small interface so the service can be tested
// with an in-memory store and no database.

import mongoose from 'mongoose'
import { Detection } from '../models/Detection.js'
import { DetectionConfig, MAX_CHANGE_LOG } from '../models/DetectionConfig.js'
import { EmergencyCase } from '../models/index.js'
import { LIVE_STATUSES, simCaseLocation } from '../monitoring/caseLocation.js'
import { HealthEvent } from '../models/HealthEvent.js'
import { ACTIVE_STATUSES } from '../../../shared/emergency.js'
import { DETECTION_OUTCOME } from '../../../shared/detection.js'

const DUPLICATE_KEY = 11000

export const mongoDetectionStore = {
  async loadConfig() {
    return DetectionConfig.findOne({ key: 'global' }).lean()
  },

  /** Replace the stored overrides and append to the change log (kept to the newest MAX_CHANGE_LOG). */
  async saveConfig(patch, change) {
    return DetectionConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: patch, $push: { changes: { $each: [change], $slice: -MAX_CHANGE_LOG } } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()
  },

  async saveDetection(doc) {
    const created = await Detection.create(doc)
    return created.toObject()
  },

  async updateDetection(id, patch) {
    return Detection.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean()
  },

  /** An abnormal stretch ended without a case: close its open detections. */
  async resolveEpisode(episode) {
    await Detection.updateMany({ episode, outcome: DETECTION_OUTCOME.PENDING }, { $set: { outcome: DETECTION_OUTCOME.RESOLVED } })
  },

  /** Feature 40: paginated, time-filtered history. */
  async listDetections({ patient, from, to, severity, outcome, page = 1, limit = 20 }) {
    const filter = { patient: new mongoose.Types.ObjectId(String(patient)) }
    if (from || to) filter.at = { ...(from && { $gte: from }), ...(to && { $lte: to }) }
    if (severity) filter.severity = severity
    if (outcome) filter.outcome = outcome
    const [items, total] = await Promise.all([
      Detection.find(filter)
        .sort({ at: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Detection.countDocuments(filter),
    ])
    return { items, total }
  },

  /**
   * Feature 39: open the case unless the patient already has a live one. The case is OUR EmergencyCase (the one hospital
   * discovery, the portal and the ambulance code read). The partial unique index on live cases turns a race between two
   * processes into a duplicate-key error that we resolve by reading the winner.
   */
  async createCaseIfNone(doc) {
    const filter = { patient: doc.patient, status: { $in: LIVE_STATUSES } }
    const detectedAt = new Date()
    const mine = {
      patient: doc.patient,
      source: 'auto_detection',
      severity: 'critical',
      riskScore: doc.detection?.riskScore,
      status: 'awaiting_confirmation', // the patient is asked "Are you okay?" first; hospitals are searched after the countdown (Phase 7)
      escalation: doc.escalation,
      detectionRef: doc.detectionRef,
      location: { type: 'Point', coordinates: simCaseLocation() },
      detectedAt,
      timeline: [{ event: 'detected', at: detectedAt, actorRole: 'system', detail: doc.timeline?.[0]?.message, data: doc.timeline?.[0]?.data }],
    }
    try {
      const res = await EmergencyCase.findOneAndUpdate(filter, { $setOnInsert: mine }, { upsert: true, new: true, includeResultMetadata: true })
      return { case: res.value.toObject(), created: !res.lastErrorObject?.updatedExisting }
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) throw err
      const existing = await EmergencyCase.findOne(filter).lean()
      if (!existing) throw err
      return { case: existing, created: false }
    }
  },

  async logEvent(doc) {
    return HealthEvent.create(doc)
  },
}

/** A store that keeps everything in memory. For tests. Mirrors the Mongo store's behaviour. */
export function memoryDetectionStore() {
  const detections = []
  const events = []
  const cases = []
  let config = null
  let seq = 0
  const id = () => `mem-${(seq += 1)}`

  return {
    detections,
    events,
    cases,
    get config() {
      return config
    },
    async loadConfig() {
      return config
    },
    async saveConfig(patch, change) {
      config = { ...(config ?? {}), ...patch, changes: [...(config?.changes ?? []), change].slice(-MAX_CHANGE_LOG) }
      return config
    },
    async saveDetection(doc) {
      const d = { ...doc, _id: id(), outcome: doc.outcome ?? DETECTION_OUTCOME.PENDING }
      detections.push(d)
      return d
    },
    async updateDetection(detId, patch) {
      const d = detections.find((x) => x._id === detId)
      if (d) Object.assign(d, patch)
      return d
    },
    async resolveEpisode(episode) {
      for (const d of detections) if (d.episode === episode && d.outcome === DETECTION_OUTCOME.PENDING) d.outcome = DETECTION_OUTCOME.RESOLVED
    },
    async listDetections({ patient, from, to, severity, outcome, page = 1, limit = 20 }) {
      let rows = detections.filter((d) => String(d.patient) === String(patient))
      if (from) rows = rows.filter((d) => d.at >= from)
      if (to) rows = rows.filter((d) => d.at <= to)
      if (severity) rows = rows.filter((d) => d.severity === severity)
      if (outcome) rows = rows.filter((d) => d.outcome === outcome)
      rows = rows.sort((a, b) => b.at - a.at)
      return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length }
    },
    async createCaseIfNone(doc) {
      const existing = cases.find((c) => String(c.patient) === String(doc.patient) && ACTIVE_STATUSES.includes(c.status))
      if (existing) return { case: existing, created: false }
      const created = { ...doc, _id: id() }
      cases.push(created)
      return { case: created, created: true }
    },
    async logEvent(doc) {
      events.push(doc)
      return doc
    },
  }
}
