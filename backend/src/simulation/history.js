// Feature 28 and 30: history and timeline queries.

import mongoose from 'mongoose'
import { VitalReading } from '../models/VitalReading.js'
import { HealthEvent } from '../models/HealthEvent.js'
import { readingStatuses, worstStatus, VITAL_KEYS } from '../../../shared/vitals.js'

const MIN = 60_000
const HOUR = 60 * MIN

/**
 * Ranges for the graphs. 1h returns every saved reading (one per 30 s);
 * longer ranges are averaged into buckets so the chart stays light, and each
 * bucket keeps the worst status seen inside it so short spikes are not hidden.
 */
export const RANGES = Object.freeze({
  '1h': { ms: HOUR, bucketMinutes: null },
  '24h': { ms: 24 * HOUR, bucketMinutes: 5 },
  '7d': { ms: 7 * 24 * HOUR, bucketMinutes: 30 },
})

const STATUS_RANK = { normal: 0, warning: 1, critical: 2 }
const RANK_STATUS = ['normal', 'warning', 'critical']

export function parseRange(range) {
  return RANGES[range] ? range : null
}

const round = (v, d = 1) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : null)

export async function vitalsHistory(patientId, range, { now = new Date(), thresholds } = {}) {
  const spec = RANGES[range]
  const from = new Date(now.getTime() - spec.ms)
  const patient = new mongoose.Types.ObjectId(String(patientId))

  if (!spec.bucketMinutes) {
    const docs = await VitalReading.find({ patient, recordedAt: { $gte: from, $lte: now } })
      .sort({ recordedAt: 1 })
      .lean()
    return docs.map((d) => {
      const vitals = Object.fromEntries(VITAL_KEYS.map((k) => [k, d[k] ?? null]))
      return { at: d.recordedAt.toISOString(), ...vitals, status: d.status ?? worstStatus(vitals, thresholds), scenario: d.scenario }
    })
  }

  const avg = Object.fromEntries(VITAL_KEYS.map((k) => [k, { $avg: `$${k}` }]))
  const rows = await VitalReading.aggregate([
    { $match: { patient, recordedAt: { $gte: from, $lte: now } } },
    {
      $group: {
        _id: { $dateTrunc: { date: '$recordedAt', unit: 'minute', binSize: spec.bucketMinutes } },
        ...avg,
        worst: {
          $max: { $switch: { branches: [{ case: { $eq: ['$status', 'critical'] }, then: 2 }, { case: { $eq: ['$status', 'warning'] }, then: 1 }], default: 0 } },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  return rows.map((r) => {
    const vitals = Object.fromEntries(VITAL_KEYS.map((k) => [k, round(r[k], k === 'temp' ? 2 : 1)]))
    const avgStatus = worstStatus(vitals, thresholds)
    const status = RANK_STATUS[Math.max(r.worst ?? 0, STATUS_RANK[avgStatus])]
    return { at: r._id.toISOString(), ...vitals, status, samples: r.count }
  })
}

/** Feature 30: readings and events on one time axis. */
export async function healthTimeline(patientId, range, { now = new Date(), thresholds } = {}) {
  const spec = RANGES[range]
  const from = new Date(now.getTime() - spec.ms)
  const [readings, events] = await Promise.all([
    vitalsHistory(patientId, range, { now, thresholds }),
    HealthEvent.find({ patient: patientId, at: { $gte: from, $lte: now } })
      .sort({ at: 1 })
      .lean(),
  ])
  return {
    from: from.toISOString(),
    to: now.toISOString(),
    readings: readings.map((r) => ({ at: r.at, status: r.status, hr: r.hr, spo2: r.spo2 })),
    events: events.map((e) => ({
      id: String(e._id),
      at: e.at.toISOString(),
      type: e.type,
      message: e.message,
      severity: e.severity,
      data: e.data ?? null,
    })),
  }
}

export { readingStatuses }
