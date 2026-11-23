// Features 51-61: finding, ranking and notifying hospitals. This is the `discovery` object that
// emergency/service.js calls ({ notify }) whenever a case is sent and at every wider search round.

import mongoose from 'mongoose'
import { Hospital } from '../models/Hospital.js'
import { EmergencyCase } from '../models/EmergencyCase.js'
import { recordHospitalCase } from '../services/hospitalCases.js'
import { CASE_STATUS, ESCALATION, HOSPITAL_RESPONSE, SEVERITY, hospitalRoom } from '../../../shared/emergency.js'
import { RESPONSE_EVENTS } from '../../../shared/response.js'
import { capabilityCard } from './capability.js'
import { distanceKm } from './geo.js'
import { isCardiacCapable, rankScore } from './ranking.js'

export const FIRST_ROUND_HOSPITALS = 3 // "the top 3 are notified first" (59)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const entry = (type, message, data) => ({ type, at: new Date(), actorRole: 'system', message, data })

export function createDiscovery({ io, logger = console, now = () => Date.now(), responseWindowMs = ESCALATION.ROUND_TIMEOUT_MS } = {}) {
  /**
   * Features 53-57, 59: hospitals within `radiusKm` of a point, nearest data first, each with its capability card,
   * score and breakdown, sorted best first. `cardiacOnly` is the facility filter (57); `q` searches name or area (56).
   */
  async function nearby({ lng, lat, radiusKm = 30, cardiacOnly = false, q, limit = 25 } = {}) {
    if (![lng, lat].every(Number.isFinite)) throw Object.assign(new Error('lng and lat are required numbers'), { status: 400 })
    const query = { isActive: true }
    if (q) query.$or = [{ name: new RegExp(escapeRe(String(q)), 'i') }, { address: new RegExp(escapeRe(String(q)), 'i') }, { city: new RegExp(escapeRe(String(q)), 'i') }]
    const rows = await Hospital.aggregate([
      { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distM', maxDistance: radiusKm * 1000, spherical: true, query } },
      { $limit: 100 },
    ])
    const cards = await Promise.all(rows.map(async (h) => {
      const capability = await capabilityCard(h)
      const km = Math.round((h.distM / 1000) * 10) / 10
      return { id: String(h._id), name: h.name, address: h.address, city: h.city, phone: h.phone, location: h.location, distanceKm: km, capability, cardiacCapable: isCardiacCapable(capability), ...rankScore({ distanceKm: h.distM / 1000, cap: capability }) }
    }))
    return cards.filter((h) => !cardiacOnly || h.cardiacCapable).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm).slice(0, limit)
  }

  function alertPayload(c, hospital, response) {
    const sev = SEVERITY[c.severity] ?? SEVERITY[3]
    return {
      caseId: String(c._id),
      caseNumber: c.caseNumber ?? null,
      hospitalId: String(hospital.id ?? hospital._id),
      severity: c.severity,
      severityLabel: sev.label,
      riskScore: c.detection?.riskScore ?? null,
      vitals: c.detection?.snapshot ?? null,
      symptoms: c.symptoms ?? null,
      rulesFired: (c.detection?.rulesFired ?? []).slice(0, 4).map((r) => r.message ?? r.rule),
      distanceKm: response.distanceKm,
      rank: response.rank,
      score: response.score,
      notifiedAt: response.notifiedAt.toISOString(),
      respondBy: new Date(response.notifiedAt.getTime() + responseWindowMs).toISOString(),
      location: c.location ? { point: c.location.point, address: c.location.address ?? null } : null,
      simulated: true,
    }
  }

  /** Pushes the chosen hospitals onto the case (only while it is still searching) and tells each hospital's room. */
  async function notifyHospitals(c, picked, round) {
    const done = []
    let rank = (c.hospitalResponses?.length ?? 0)
    for (const h of picked) {
      rank += 1
      const response = { hospital: h.id, round, rank, score: h.score, distanceKm: h.distanceKm, notifiedAt: new Date(now()), status: HOSPITAL_RESPONSE.NOTIFIED }
      const updated = await EmergencyCase.findOneAndUpdate(
        { _id: c._id, status: CASE_STATUS.SEARCHING, 'hospitalResponses.hospital': { $ne: new mongoose.Types.ObjectId(h.id) } },
        { $push: { hospitalResponses: response, timeline: entry('hospital_notified', `${h.name} notified (rank ${rank}, ${h.distanceKm} km)`, { hospital: h.id, rank, score: h.score, round }) } },
        { returnDocument: 'after' },
      ).lean()
      if (!updated) continue // accepted, cancelled or already told in the meantime
      await recordHospitalCase({
        hospitalId: h.id,
        emergencyCaseId: String(c._id),
        patient: c.patient,
        patientId: c.patientCode,
        summary: `Possible cardiac emergency, risk ${c.detection?.riskScore ?? '?'}/100`,
        severity: c.severity >= 3 ? 'critical' : c.severity === 2 ? 'high' : 'moderate',
      }).catch((err) => logger.error?.('[discovery] could not record the hospital case', err.message))
      const payload = alertPayload(updated, h, response)
      io?.to(hospitalRoom(h.id)).emit(RESPONSE_EVENTS.HOSPITAL_ALERT, payload)
      done.push({ hospital: h.id, name: h.name, rank, payload })
    }
    return done
  }

  /** The cardiac filter is on in an emergency; if it leaves nobody, fall back to all hospitals rather than strand the patient. */
  async function candidates(c, radiusKm) {
    const point = c.location?.point?.coordinates
    if (!point) return { list: [], relaxed: false }
    const told = new Set((c.hospitalResponses ?? []).map((r) => String(r.hospital)))
    const all = (await nearby({ lng: point[0], lat: point[1], radiusKm, limit: 50 })).filter((h) => !told.has(h.id))
    const cardiac = all.filter((h) => h.cardiacCapable)
    return cardiac.length ? { list: cardiac, relaxed: false } : { list: all, relaxed: all.length > 0 }
  }

  return {
    nearby,
    alertPayload,

    /** Called by the emergency service at the start and at every wider round (45, 61). */
    async notify({ caseId, round = 1, radiusKm }) {
      const c = await EmergencyCase.findById(caseId).lean()
      if (!c || c.status !== CASE_STATUS.SEARCHING) return []
      const { list, relaxed } = await candidates(c, radiusKm ?? c.escalation?.radiusKm ?? 10)
      if (relaxed) await EmergencyCase.updateOne({ _id: c._id }, { $push: { timeline: entry('filter_relaxed', 'No cardiac-capable hospital in range: notifying the nearest hospitals instead') } })
      return notifyHospitals(c, list.slice(0, FIRST_ROUND_HOSPITALS), round || 1)
    },

    /** Feature 60: a hospital rejected, so tell the next best one in the current radius. */
    async notifyNext(caseId, count = 1) {
      const c = await EmergencyCase.findById(caseId).lean()
      if (!c || c.status !== CASE_STATUS.SEARCHING) return []
      const { list } = await candidates(c, c.escalation?.radiusKm ?? 10)
      return notifyHospitals(c, list.slice(0, count), c.escalation?.round || 1)
    },
  }
}
