import { EmergencyCase } from '../models/EmergencyCase.js'
import { Hospital } from '../models/Hospital.js'
import { GOLDEN_HOUR, byPriority, goldenHour } from '../../../shared/response.js'

const LIVE = ['awaiting_confirmation', 'searching', 'accepted', 'ambulance_assigned', 'patient_on_board', 'unresolved']
const DAY = 86_400_000
const t = (c, pred) => (c.timeline ?? []).find(pred)?.at
const ms = (a, b) => (a && b ? Math.max(0, new Date(b) - new Date(a)) : null)
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }

/** Feature 95: every live case across hospitals, most urgent first (severity, risk, waiting time, distance to the accepting or nearest hospital). */
export async function prioritisedQueue(now = Date.now()) {
  const cases = await EmergencyCase.find({ status: { $in: LIVE } }).lean()
  const hospitals = new Map((await Hospital.find({}, { name: 1 }).lean()).map((h) => [String(h._id), h.name]))
  return cases.map((c) => {
    const nearest = Math.min(...(c.hospitalResponses ?? []).map((r) => r.distanceKm ?? Infinity))
    const sent = t(c, (e) => e.type === 'sent' || e.type === 'sos') ?? c.createdAt
    return {
      id: String(c._id), caseNumber: c.caseNumber ?? null, patientCode: c.patientCode, status: c.status, severity: c.severity,
      riskScore: c.detection?.riskScore ?? 0, waitingMs: now - new Date(sent).getTime(), distanceKm: Number.isFinite(nearest) ? nearest : 0,
      hospital: c.acceptedHospital ? hospitals.get(String(c.acceptedHospital)) ?? null : null,
      hospitalsTold: (c.hospitalResponses ?? []).length, goldenHour: goldenHour(c, now),
    }
  }).sort(byPriority)
}

/** Feature 96: cases per day, stage times against the golden-hour targets, acceptance rate per hospital, false-alarm rate. */
export async function emergencyAnalytics({ days = 14, now = Date.now() } = {}) {
  const since = new Date(now - days * DAY)
  const cases = await EmergencyCase.find({ createdAt: { $gte: since } }).lean()
  const perDay = Object.fromEntries(Array.from({ length: days }, (_, i) => [new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10), 0]))
  for (const c of cases) { const k = new Date(c.createdAt).toISOString().slice(0, 10); if (k in perDay) perDay[k] += 1 }

  const sent = (c) => t(c, (e) => e.type === 'sent' || e.type === 'sos') ?? c.createdAt
  const stage = (c, s) => t(c, (e) => e.type === 'trip_stage' && e.data?.stage === s)
  const rows = cases.map((c) => ({
    toAccept: ms(sent(c), c.acceptedAt),
    toDispatch: ms(c.acceptedAt, t(c, (e) => e.type === 'ambulance_assigned')),
    toCathLab: ms(sent(c), t(c, (e) => e.type === 'preparation' && e.data?.item === 'cathLabTeamAlerted' && e.data?.value === true)),
    sceneTime: ms(stage(c, 'at_patient'), stage(c, 'patient_on_board')),
    toHospital: ms(stage(c, 'patient_on_board'), t(c, (e) => e.type === 'arrived')),
  }))
  const stat = (key, target) => { const v = rows.map((r) => r[key]).filter((x) => x != null); const med = median(v); return { samples: v.length, medianMs: med, targetMs: target ?? null, overTarget: target != null ? v.filter((x) => x > target).length : null } }
  const stages = {
    alertToAccept: stat('toAccept'),
    acceptToDispatch: stat('toDispatch'),
    alertToCathLab: stat('toCathLab', GOLDEN_HOUR.alertToCathLabMs),
    sceneTime: stat('sceneTime', GOLDEN_HOUR.sceneTimeMs),
    pickupToHospital: stat('toHospital'),
  }

  const names = new Map((await Hospital.find({}, { name: 1 }).lean()).map((h) => [String(h._id), h.name]))
  const per = new Map()
  for (const c of cases) for (const r of c.hospitalResponses ?? []) {
    const row = per.get(String(r.hospital)) ?? { hospital: names.get(String(r.hospital)) ?? 'Unknown', notified: 0, accepted: 0, rejected: 0 }
    row.notified += 1
    if (r.status === 'accepted') row.accepted += 1
    if (r.status === 'rejected') row.rejected += 1
    per.set(String(r.hospital), row)
  }
  const acceptance = [...per.values()].map((r) => ({ ...r, rate: r.notified ? Math.round((r.accepted / r.notified) * 100) : 0 })).sort((a, b) => b.notified - a.notified)

  const cancelled = cases.filter((c) => c.status === 'cancelled')
  const falseAlarms = cancelled.filter((c) => c.cancellation?.reason === 'false_alarm').length
  return {
    days, total: cases.length, perDay: Object.entries(perDay).map(([date, count]) => ({ date, count })), stages, acceptance,
    falseAlarm: { count: falseAlarms, cancelled: cancelled.length, ratePercent: cases.length ? Math.round((falseAlarms / cases.length) * 100) : 0 },
    simulated: true,
  }
}
