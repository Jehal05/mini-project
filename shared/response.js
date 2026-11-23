// HealthTwin AI: hospital response and ambulance vocabulary (features 59-80, 95, 103, 105, 107).
// Shared by the server and all three portals so event names, trip stages and the golden-hour targets are spelled once.

/** Socket.IO events of the response flow. Rooms: patient:<id>, hospital:<id>, central-admin. */
export const RESPONSE_EVENTS = Object.freeze({
  HOSPITAL_ALERT: 'hospital:alert', // a hospital is told about a case (61)
  ACCEPTED: 'emergency:accepted', // a hospital accepted (65, 67)
  TAKEN: 'emergency:taken', // another hospital accepted first (65)
  REJECTED: 'emergency:rejected', // a hospital rejected; the next one is notified (66, 60)
  DOCTOR: 'emergency:doctor', // a doctor was assigned (68)
  PREPARATION: 'hospital:preparation', // checklist progress (69)
  AMBULANCE_ASSIGNED: 'ambulance:assigned', // (73, 74)
  AMBULANCE_UNAVAILABLE: 'ambulance:unavailable', // nobody free: staff assign by hand or call 108
  AMBULANCE_POSITION: 'ambulance:position', // every 2 s while moving (75, 77)
  AMBULANCE_STATUS: 'ambulance:status', // a trip stage changed (78, 79)
  ARRIVED: 'emergency:arrived', // at the hospital (80)
  CLOSED: 'emergency:closed',
})

/** Feature 78: the trip, in order. */
export const TRIP_STAGES = Object.freeze(['en_route', 'at_patient', 'patient_on_board', 'en_route_to_hospital', 'at_hospital'])
export const TRIP_LABEL = Object.freeze({
  en_route: 'Ambulance on the way',
  at_patient: 'At the patient',
  patient_on_board: 'Patient on board',
  en_route_to_hospital: 'On the way to the hospital',
  at_hospital: 'At the hospital',
})
export const AMBULANCE_TYPES = Object.freeze(['BLS', 'ALS'])
export const AMBULANCE_STATUSES = Object.freeze(['available', 'dispatched', 'on_trip', 'maintenance'])

/** Feature 69: the hospital preparation checklist. */
export const PREPARATION_ITEMS = Object.freeze({
  edBayReady: 'ED bay ready',
  cathLabTeamAlerted: 'Cath lab team alerted',
  ccuBedReserved: 'CCU bed reserved',
  ecgReadyOnArrival: 'ECG ready on arrival',
})

/** Feature 105: targets from the plan (demonstration values, not clinical advice). */
export const GOLDEN_HOUR = Object.freeze({
  alertToCathLabMs: 30 * 60_000,
  sceneTimeMs: 10 * 60_000,
  contactToTreatmentMs: 90 * 60_000,
})

const at = (timeline, pred) => {
  const hit = (timeline ?? []).find(pred)
  return hit ? new Date(hit.at).getTime() : null
}

/**
 * Feature 105: the three running clocks of a case, from its timeline.
 * Each stage: { key, label, targetMs, startedAt, endedAt, elapsedMs, overrun, state: 'waiting'|'running'|'done' }.
 * A stage is `overrun` once it has run past its target, finished or not. Pure: pass `now` in milliseconds.
 */
export function goldenHour(c, now = Date.now()) {
  const tl = c?.timeline ?? []
  const alertAt = at(tl, (e) => e.type === 'sent' || e.type === 'hospital_notified') ?? (c?.createdAt ? new Date(c.createdAt).getTime() : null)
  const cathAt = at(tl, (e) => e.type === 'preparation' && e.data?.item === 'cathLabTeamAlerted' && e.data?.value === true)
  const stage = (s) => at(tl, (e) => e.type === 'trip_stage' && e.data?.stage === s)
  const sceneStart = stage('at_patient')
  const sceneEnd = stage('patient_on_board')
  const treatEnd = at(tl, (e) => e.type === 'admitted')
  const closed = ['cancelled', 'closed'].includes(c?.status)
  const clock = (key, label, targetMs, startedAt, endedAt) => {
    if (startedAt == null) return { key, label, targetMs, startedAt: null, endedAt: null, elapsedMs: 0, overrun: false, state: 'waiting' }
    const end = endedAt ?? (closed ? new Date(c.closedAt ?? now).getTime() : now)
    const elapsedMs = Math.max(0, end - startedAt)
    return { key, label, targetMs, startedAt, endedAt, elapsedMs, overrun: elapsedMs > targetMs, state: endedAt != null ? 'done' : closed ? 'done' : 'running' }
  }
  return [
    clock('cathLab', 'Alert to cath lab team', GOLDEN_HOUR.alertToCathLabMs, alertAt, cathAt),
    clock('scene', 'Ambulance scene time', GOLDEN_HOUR.sceneTimeMs, sceneStart, sceneEnd),
    clock('treatment', 'First medical contact to treatment', GOLDEN_HOUR.contactToTreatmentMs, sceneStart ?? alertAt, treatEnd),
  ]
}

/**
 * Feature 95: one number to sort a queue by, so the most urgent case is on top.
 * Severity dominates; then the risk score; then how long it has waited (capped, so an old low case never
 * outranks a new critical one); nearer cases win ties.
 */
export function priorityScore({ severity = 1, riskScore = 0, waitingMs = 0, distanceKm = 0 } = {}) {
  const waitingMin = Math.min(30, Math.max(0, waitingMs / 60_000))
  return severity * 1000 + riskScore * 5 + waitingMin * 8 - Math.min(50, Math.max(0, distanceKm)) * 2
}
export const byPriority = (a, b) => priorityScore(b) - priorityScore(a)
