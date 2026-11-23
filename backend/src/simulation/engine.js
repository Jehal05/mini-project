// Features 21-27, 29: the server-side simulation engine.
//
// Every tick (2 s) each monitored patient's vitals take one step of an
// Ornstein-Uhlenbeck process: a pull towards the scenario's target plus random
// noise. That gives realistic drift around the baseline at rest and a smooth
// glide (about 30-60 s) when the scenario changes. Systolic and diastolic
// pressure share part of their noise so they move together (feature 22).
//
// The engine emits `vitals:update` to the room `patient:<id>` on every tick
// and saves a VitalReading every 30 s (feature 28). All values are simulated.

import { codeOf, nameOf } from '../models/patientView.js'
import { readingStatuses, worstStatus, VITAL_KEYS, SIMULATED_LABEL } from '../../../shared/vitals.js'
import { computeBaseline } from './baseline.js'
import { scenarioTargets, isScenario, SCENARIO_INFO } from './scenarios.js'

export const VITALS_EVENT = 'vitals:update'
export const patientRoom = (id) => `patient:${id}`

// theta = share of the gap to the target closed per tick; sigma = noise per tick.
const DYNAMICS = {
  hr: { theta: 0.12, sigma: 0.6, min: 30, max: 220, decimals: 0 },
  sys: { theta: 0.1, sigma: 0.8, min: 60, max: 240, decimals: 0 },
  dia: { theta: 0.1, sigma: 0.6, min: 35, max: 150, decimals: 0 },
  spo2: { theta: 0.1, sigma: 0.22, min: 70, max: 100, decimals: 0 },
  temp: { theta: 0.04, sigma: 0.015, min: 34, max: 42, decimals: 1 },
  rr: { theta: 0.1, sigma: 0.3, min: 6, max: 45, decimals: 0 },
}

// A new worst status must hold for this many ticks before it is logged on the
// timeline, so noise right at a threshold does not flood it.
const STATUS_HOLD_TICKS = 3

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const roundTo = (v, d) => {
  const p = 10 ** d
  return Math.round(v * p) / p
}

/** Standard normal sample from a uniform RNG (Box-Muller). */
export function gaussian(rng) {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Small seedable RNG for tests and repeatable backfills. */
export function seededRng(seed = 42) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One OU step for every vital. Pure, so it is easy to test. */
export function stepVitals(current, target, rng) {
  const shared = gaussian(rng) // BP shares this so systolic and diastolic move together
  const next = {}
  for (const key of VITAL_KEYS) {
    const d = DYNAMICS[key]
    let noise = gaussian(rng)
    if (key === 'sys') noise = 0.7 * shared + 0.3 * noise
    if (key === 'dia') noise = 0.7 * shared + 0.3 * noise
    const v = current[key] + d.theta * (target[key] - current[key]) + d.sigma * noise
    next[key] = clamp(v, d.min, d.max)
  }
  return next
}

/** Values as shown and stored (HR whole numbers, temperature one decimal ...). */
export function displayVitals(v) {
  const out = {}
  for (const key of VITAL_KEYS) out[key] = roundTo(v[key], DYNAMICS[key].decimals)
  return out
}

export class SimulationEngine {
  /**
   * @param {object} opts
   * @param {object} [opts.io]          Socket.IO server (anything with .to(room).emit()).
   * @param {object} opts.store         { saveReading, logEvent, loadLastReading, loadLastScenario }
   * @param {number} [opts.tickMs=2000]
   * @param {number} [opts.saveEveryMs=30000]
   * @param {() => number} [opts.rng]
   * @param {() => number} [opts.now]  clock in ms
   * @param {object} [opts.thresholds] admin thresholds (feature 36); defaults to shared/vitals.js
   * @param {object} [opts.logger]     anything with .warn() (defaults to console)
   */
  constructor({ io = null, store, tickMs = 2000, saveEveryMs = 30_000, rng = Math.random, now = Date.now, thresholds, logger = console } = {}) {
    if (!store) throw new Error('SimulationEngine needs a store')
    this.io = io
    this.store = store
    this.tickMs = tickMs
    this.saveEveryMs = saveEveryMs
    this.rng = rng
    this.now = now
    this.thresholds = thresholds
    this.logger = logger
    this.patients = new Map()
    this.adding = new Map() // patientId -> in-flight addPatient promise
    this.timer = null
    this.listeners = new Set()
    this.ticking = false
    this.skippedTicks = 0
  }

  /**
   * Start monitoring a patient. Continues from their last saved reading and scenario if any.
   * Safe to call concurrently: callers for the same patient share one in-flight start,
   * so monitoring never starts twice (review item 5).
   */
  addPatient(patient) {
    const id = String(patient._id)
    if (this.patients.has(id)) return Promise.resolve(this.snapshot(id))
    if (this.adding.has(id)) return this.adding.get(id)
    const pending = this.startMonitoring(id, patient).finally(() => this.adding.delete(id))
    this.adding.set(id, pending)
    return pending
  }

  /**
   * The patient edited their profile (age, conditions, family history...): use the new one from the next tick.
   * The baseline moves with it, but the vitals are not jolted: they drift towards the new target as usual.
   * Returns false when the patient is not being monitored.
   */
  updateProfile(patient) {
    const state = this.patients.get(String(patient._id))
    if (!state) return false
    state.profile = patient
    state.name = nameOf(patient)
    state.baseline = computeBaseline(patient)
    state.target = scenarioTargets(state.scenario, state.baseline)
    return true
  }

  async startMonitoring(id, patient) {
    const baseline = computeBaseline(patient)
    const [last, lastScenario] = await Promise.all([this.store.loadLastReading(id), this.store.loadLastScenario(id)])
    const scenario = isScenario(lastScenario) ? lastScenario : 'stable'
    const current = {}
    for (const key of VITAL_KEYS) current[key] = typeof last?.[key] === 'number' ? last[key] : baseline[key]

    const state = {
      id,
      patientCode: codeOf(patient),
      name: nameOf(patient),
      profile: patient, // medical profile, read by the detection engine's risk score
      thresholds: null, // per-patient override (feature 36); null = use the engine-wide thresholds
      baseline,
      scenario,
      target: scenarioTargets(scenario, baseline),
      current,
      lastSavedAt: 0,
      status: null,
      pendingStatus: null,
      pendingTicks: 0,
      lastUpdate: null,
    }
    this.patients.set(id, state)
    state.lastUpdate = this.buildUpdate(state, this.now())
    state.status = state.lastUpdate.status

    if (!last) {
      await this.store.logEvent({
        patient: id,
        type: 'monitoring_started',
        at: new Date(this.now()),
        message: 'Simulated monitoring started',
        severity: 'info',
        data: { baseline },
      })
    }
    return this.snapshot(id)
  }

  removePatient(id) {
    this.patients.delete(String(id))
  }

  has(id) {
    return this.patients.has(String(id))
  }

  /** Feature 26: presenter control. Returns the new snapshot. */
  async setScenario(id, scenario, { actorRole = 'presenter', actorId } = {}) {
    const state = this.patients.get(String(id))
    if (!state) throw Object.assign(new Error('Patient is not being monitored'), { status: 404 })
    if (!isScenario(scenario)) throw Object.assign(new Error(`Unknown scenario: ${scenario}`), { status: 400 })
    const from = state.scenario
    if (from === scenario) return this.snapshot(state.id)

    state.scenario = scenario
    state.target = scenarioTargets(scenario, state.baseline)
    await this.store.logEvent({
      patient: state.id,
      type: 'scenario_change',
      at: new Date(this.now()),
      message: `Scenario changed: ${SCENARIO_INFO[from].label} → ${SCENARIO_INFO[scenario].label}`,
      severity: scenario === 'cardiac_event' ? 'critical' : scenario === 'stable' ? 'normal' : 'warning',
      actorRole,
      actorId,
      data: { from, to: scenario },
    })
    this.emit(state, state.lastUpdate) // let screens show the new scenario at once
    return this.snapshot(state.id)
  }

  /** Feature 36: thresholds in force for one patient (their own overrides, else the engine-wide ones). */
  thresholdsFor(state) {
    return state.thresholds ?? this.thresholds
  }

  /** Feature 36: apply new engine-wide thresholds at once, without a restart. */
  setThresholds(thresholds) {
    this.thresholds = thresholds
  }

  /** Feature 36: per-patient override from a doctor; pass null to go back to the engine-wide ones. */
  setPatientThresholds(id, thresholds) {
    const state = this.patients.get(String(id))
    if (state) state.thresholds = thresholds ?? null
  }

  buildUpdate(state, nowMs) {
    const vitals = displayVitals(state.current)
    const thresholds = this.thresholdsFor(state)
    const statuses = readingStatuses(vitals, thresholds)
    return {
      patientId: state.id,
      patientCode: state.patientCode,
      at: new Date(nowMs).toISOString(),
      vitals,
      statuses,
      status: worstStatus(vitals, thresholds),
      scenario: state.scenario,
      simulated: true,
      label: 'Simulated',
      notice: SIMULATED_LABEL,
    }
  }

  emit(state, update) {
    const payload = { ...update, scenario: state.scenario }
    this.io?.to(patientRoom(state.id)).emit(VITALS_EVENT, payload)
    for (const fn of this.listeners) fn(payload)
  }

  /** Subscribe to every update in-process (the detection engine uses this). Returns an unsubscribe fn. */
  onUpdate(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Advance every patient by one tick. Exposed for tests; start() calls it on a timer. */
  async tick() {
    const nowMs = this.now()
    const work = []
    for (const state of this.patients.values()) {
      state.current = stepVitals(state.current, state.target, this.rng)
      const update = this.buildUpdate(state, nowMs)
      state.lastUpdate = update
      this.emit(state, update)

      if (nowMs - state.lastSavedAt >= this.saveEveryMs) {
        state.lastSavedAt = nowMs
        work.push(
          this.store.saveReading({
            patient: state.id,
            recordedAt: new Date(nowMs),
            ...update.vitals,
            scenario: state.scenario,
            statuses: update.statuses,
            status: update.status,
          }),
        )
      }
      work.push(this.trackStatus(state, update, nowMs))
    }
    await Promise.all(work)
  }

  async trackStatus(state, update, nowMs) {
    if (update.status === state.status) {
      state.pendingStatus = null
      state.pendingTicks = 0
      return
    }
    if (update.status !== state.pendingStatus) {
      state.pendingStatus = update.status
      state.pendingTicks = 1
    } else {
      state.pendingTicks += 1
    }
    if (state.pendingTicks < STATUS_HOLD_TICKS) return

    const from = state.status
    state.status = update.status
    state.pendingStatus = null
    state.pendingTicks = 0
    const worst = Object.entries(update.statuses)
      .filter(([, s]) => s === update.status)
      .map(([k]) => k)
    await this.store.logEvent({
      patient: state.id,
      type: 'status_change',
      at: new Date(nowMs),
      message: `Status ${from ?? 'unknown'} → ${update.status}${worst.length && update.status !== 'normal' ? ` (${worst.join(', ')})` : ''}`,
      severity: update.status,
      data: { from, to: update.status, vitals: update.vitals },
    })
  }

  snapshot(id) {
    const state = this.patients.get(String(id))
    if (!state) return null
    return { ...state.lastUpdate, scenario: state.scenario, baseline: state.baseline, name: state.name }
  }

  list() {
    return [...this.patients.keys()].map((id) => this.snapshot(id))
  }

  /**
   * Run one tick unless the previous one is still running (e.g. MongoDB is slow).
   * Overlapping ticks would interleave state updates and saves (review item 4).
   * Returns true if the tick ran, false if it was skipped.
   */
  async runTick() {
    if (this.ticking) {
      this.skippedTicks += 1
      this.logger.warn(`[simulation] previous tick still running; skipped a tick (${this.skippedTicks} skipped so far)`)
      return false
    }
    this.ticking = true
    try {
      await this.tick()
      return true
    } catch (err) {
      this.logger.error?.('[simulation] tick failed:', err)
      return false
    } finally {
      this.ticking = false
    }
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.runTick()
    }, this.tickMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
  }
}

/**
 * Generate past readings for a patient so the 24 h and 7 d graphs have data
 * on a fresh database. Uses the same dynamics as the live engine.
 */
export function generateHistory({ baseline, from, to, stepMs, rng = Math.random, scenario = 'stable' }) {
  const target = scenarioTargets(scenario, baseline)
  let current = { ...baseline }
  const out = []
  // Several engine steps per stored point keep the noise level realistic.
  const substeps = Math.max(1, Math.round(stepMs / 2000 / 15))
  for (let t = from; t <= to; t += stepMs) {
    for (let i = 0; i < substeps; i += 1) current = stepVitals(current, target, rng)
    out.push({ recordedAt: new Date(t), vitals: displayVitals(current), scenario })
  }
  return out
}
