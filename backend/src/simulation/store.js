// Persistence used by the engine. Kept behind a small interface so the engine
// can be unit-tested with an in-memory store and no database.

import { VitalReading } from '../models/VitalReading.js'
import { HealthEvent } from '../models/HealthEvent.js'

export const mongoStore = {
  async saveReading(doc) {
    return VitalReading.create(doc)
  },
  async logEvent(doc) {
    return HealthEvent.create(doc)
  },
  /** The newest reading, so a restarted engine continues from where it stopped. */
  async loadLastReading(patientId) {
    return VitalReading.findOne({ patient: patientId }).sort({ recordedAt: -1 }).lean()
  },
  /** The last scenario chosen, so a restart keeps the presenter's choice. */
  async loadLastScenario(patientId) {
    const ev = await HealthEvent.findOne({ patient: patientId, type: 'scenario_change' }).sort({ at: -1 }).lean()
    return ev?.data?.to ?? null
  },
}

/** A store that keeps everything in arrays. For tests. */
export function memoryStore() {
  const readings = []
  const events = []
  return {
    readings,
    events,
    async saveReading(doc) {
      readings.push(doc)
      return doc
    },
    async logEvent(doc) {
      events.push(doc)
      return doc
    },
    async loadLastReading(patientId) {
      return [...readings].reverse().find((r) => String(r.patient) === String(patientId)) ?? null
    },
    async loadLastScenario(patientId) {
      const ev = [...events].reverse().find((e) => String(e.patient) === String(patientId) && e.type === 'scenario_change')
      return ev?.data?.to ?? null
    },
  }
}
