// Pure simulation of the hospital: patient vitals, emergency alerts,
// ambulance dispatch and bed occupancy. One TICK = one second of demo time.
import {
  AMBULANCES,
  CONDITIONS,
  HOSPITAL,
  INITIAL_BEDS,
  PATIENTS,
  SCRIPTED_EVENT,
} from '../data/seed.js'
import { distanceKm, lerpPoint } from '../utils/geo.js'

export const TRAVEL_TICKS = 18 // seconds for each ambulance leg (time-compressed)
export const SCENE_TICKS = 5 // seconds paramedics spend at the scene
const HISTORY_LEN = 60
const NOISE = { hr: 1.6, spo2: 0.35, sys: 1.8, dia: 1.2, glucose: 1.5, rr: 0.5, temp: 0.03 }

export const ACTIVE_ALERT_STATUSES = ['new', 'dispatched', 'at-scene', 'transporting']

const point = (o) => ({ lat: o.lat, lng: o.lng })
const jitter = (key) => (Math.random() * 2 - 1) * NOISE[key]

export function createInitialState(now = Date.now()) {
  return {
    tick: 0,
    now,
    running: true,
    nextId: 1,
    beds: structuredClone(INITIAL_BEDS),
    patients: PATIENTS.map((p) => ({
      ...structuredClone(p),
      home: point(p),
      pos: point(p),
      vitals: { ...p.baseline },
      // A little past data so the chart isn't empty on load.
      history: Array.from({ length: 20 }, (_, i) => ({
        t: i - 19,
        hr: Math.round(p.baseline.hr + jitter('hr')),
        spo2: Math.round(Math.min(100, p.baseline.spo2 + jitter('spo2'))),
      })),
      status: 'monitoring', // monitoring | emergency | in-transit | admitted
      emergency: null,
      bed: null,
    })),
    ambulances: AMBULANCES.map((a) => ({
      ...a,
      pos: point(a),
      status: 'available', // available | en-route | at-scene | transporting
      alertId: null,
      leg: null,
      wait: 0,
    })),
    alerts: [],
    events: [],
  }
}

function log(d, text, level = 'info') {
  d.events.unshift({ id: d.nextId++, at: d.now, text, level })
  if (d.events.length > 40) d.events.length = 40
}

function startEmergency(d, patient, condition, source) {
  if (!patient || patient.status !== 'monitoring' || !CONDITIONS[condition]) return
  const c = CONDITIONS[condition]
  patient.status = 'emergency'
  patient.emergency = { condition, since: d.tick }
  d.alerts.unshift({
    id: `ALT-${String(d.nextId++).padStart(3, '0')}`,
    patientId: patient.id,
    condition,
    priority: c.priority,
    source,
    createdAt: d.now,
    createdTick: d.tick,
    status: 'new',
    ambulanceId: null,
  })
  log(d, `${c.label} alert: ${patient.name} (${patient.area}), via ${source}`, 'critical')
}

function stepVitals(d, p) {
  const cond = p.emergency && CONDITIONS[p.emergency.condition]
  const target = cond ? { ...p.baseline, ...cond.target } : p.baseline
  const rate = cond ? 0.12 : p.status === 'admitted' ? 0.06 : 0.25
  for (const key of Object.keys(p.baseline)) {
    const next = p.vitals[key] + (target[key] - p.vitals[key]) * rate + jitter(key)
    p.vitals[key] = key === 'spo2' ? Math.min(100, next) : next
  }
  p.history.push({ t: d.tick, hr: Math.round(p.vitals.hr), spo2: Math.round(p.vitals.spo2) })
  if (p.history.length > HISTORY_LEN) p.history.shift()
}

function freeAmbulance(a) {
  a.status = 'available'
  a.alertId = null
  a.leg = null
  a.wait = 0
}

function stepAmbulance(d, a) {
  if (a.status === 'available') return
  const alert = d.alerts.find((x) => x.id === a.alertId)
  const p = alert && d.patients.find((x) => x.id === alert.patientId)
  if (!alert || !p) return freeAmbulance(a)

  if (a.status === 'at-scene') {
    a.wait -= 1
    if (a.wait > 0) return
    a.status = 'transporting'
    a.leg = { from: point(a.pos), to: point(HOSPITAL), progress: 0, km: distanceKm(a.pos, HOSPITAL) }
    alert.status = 'transporting'
    p.status = 'in-transit'
    log(d, `${a.id} is bringing ${p.name} to the hospital`, 'info')
    return
  }

  // en-route or transporting: move along the current leg
  a.leg.progress = Math.min(1, a.leg.progress + 1 / TRAVEL_TICKS)
  a.pos = lerpPoint(a.leg.from, a.leg.to, a.leg.progress)
  if (a.status === 'transporting') p.pos = { ...a.pos }
  if (a.leg.progress < 1) return

  if (a.status === 'en-route') {
    a.status = 'at-scene'
    a.wait = SCENE_TICKS
    a.leg = null
    alert.status = 'at-scene'
    log(d, `${a.id} reached ${p.name}; paramedics are stabilising the patient`, 'info')
    return
  }

  // Arrived at the hospital
  const c = CONDITIONS[alert.condition]
  const bed = d.beds[c.bed]
  freeAmbulance(a)
  alert.status = 'admitted'
  alert.closedAt = d.now
  p.status = 'admitted'
  p.emergency = null
  p.bed = c.bed
  p.pos = point(HOSPITAL)
  if (bed.occupied >= bed.total) log(d, `${bed.label} is full; ${p.name} needs an overflow bed`, 'warning')
  bed.occupied = Math.min(bed.total, bed.occupied + 1)
  log(d, `${p.name} admitted to ${bed.label}`, 'success')
}

function dispatch(d, alertId) {
  const alert = d.alerts.find((x) => x.id === alertId)
  if (!alert || alert.status !== 'new') return
  const p = d.patients.find((x) => x.id === alert.patientId)
  const free = d.ambulances.filter((a) => a.status === 'available')
  if (free.length === 0) {
    log(d, `No ambulance free for ${p.name}. Alert stays in the queue`, 'warning')
    return
  }
  const amb = free.reduce((best, a) => (distanceKm(a.pos, p.pos) < distanceKm(best.pos, p.pos) ? a : best))
  const km = distanceKm(amb.pos, p.pos)
  amb.status = 'en-route'
  amb.alertId = alert.id
  amb.leg = { from: point(amb.pos), to: point(p.pos), progress: 0, km }
  alert.status = 'dispatched'
  alert.ambulanceId = amb.id
  alert.acceptedAt = d.now
  log(d, `Alert ${alert.id} accepted. ${amb.id} dispatched to ${p.name} (${km.toFixed(1)} km)`, 'info')
}

export function reducer(state, action) {
  if (action.type === 'TOGGLE_RUNNING') return { ...state, running: !state.running }
  if (action.type === 'RESET') return createInitialState(action.now)

  const d = structuredClone(state)
  if (action.now) d.now = action.now

  switch (action.type) {
    case 'TICK': {
      d.tick += 1
      if (d.tick === SCRIPTED_EVENT.atTick) {
        const p = d.patients.find((x) => x.id === SCRIPTED_EVENT.patientId)
        startEmergency(d, p, SCRIPTED_EVENT.condition, 'AI vitals monitor')
      }
      d.patients.forEach((p) => stepVitals(d, p))
      d.ambulances.forEach((a) => stepAmbulance(d, a))
      return d
    }
    case 'TRIGGER_EMERGENCY': {
      const p = d.patients.find((x) => x.id === action.patientId)
      startEmergency(d, p, action.condition, 'Patient SOS (demo)')
      return d
    }
    case 'DISPATCH':
      dispatch(d, action.alertId)
      return d
    case 'DISMISS': {
      const alert = d.alerts.find((x) => x.id === action.alertId)
      if (!alert || alert.status !== 'new') return state
      const p = d.patients.find((x) => x.id === alert.patientId)
      alert.status = 'dismissed'
      alert.closedAt = d.now
      p.status = 'monitoring'
      p.emergency = null
      log(d, `Alert ${alert.id} for ${p.name} dismissed as a false alarm`, 'info')
      return d
    }
    case 'DISCHARGE': {
      const p = d.patients.find((x) => x.id === action.patientId)
      if (!p || p.status !== 'admitted') return state
      d.beds[p.bed].occupied = Math.max(0, d.beds[p.bed].occupied - 1)
      p.status = 'monitoring'
      p.bed = null
      p.pos = { ...p.home }
      log(d, `${p.name} discharged and back on home monitoring`, 'success')
      return d
    }
    default:
      return state
  }
}
