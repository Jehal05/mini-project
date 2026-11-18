// The detection engine (features 31-40). Listens to every simulated reading, applies the
// rule table, keeps a severity level per patient, records detections and, at Level 3,
// opens exactly one EmergencyCase.
//
// Per tick, per patient:
//   1. persistence  - each vital must be abnormal 3 ticks in a row (31-33), and the same for
//                     "far from own baseline" (35)
//   2. evaluate     - the rule table gives a level 0-3 and the reasons (34, 38)
//   3. transition   - a higher level shows at once; a lower one must hold 3 ticks (no flapping)
//   4. effects      - on a rise: save a Detection (40), log a timeline event, and at Level 3 open
//                     the case (39). When it falls back to 0: close the episode.
//
// Steps 1-3 run synchronously inside the engine's emit, so state never interleaves. The
// database work is queued per patient, so effects for one patient run in order.

import { randomUUID } from 'node:crypto'
import { VITAL_KEYS } from '../../../shared/vitals.js'
import { CASE_SOURCE, CASE_STATUS, ESCALATION, SEVERITY } from '../../../shared/emergency.js'
import { DEESCALATION_TICKS, DETECTION_EVENTS, DETECTION_OUTCOME, PERSISTENCE_TICKS } from '../../../shared/detection.js'
import { SIMULATED_LABEL } from '../../../shared/vitals.js'
import { patientRoom } from '../simulation/engine.js'
import { baselineDeviation, evaluate, severityInfo, statusRanks, RANK_STATUS } from './evaluate.js'
import { createPersistence } from './persistence.js'
import { computeRisk, staticRisk } from './risk.js'
import {
  resolveConfig,
  validateBaselineLimits,
  validateRiskWeights,
  validateThresholdOverrides,
} from './config.js'

const EVENT_SEVERITY = { 1: 'warning', 2: 'critical', 3: 'critical' }

/** What the dashboard shows. detection:update is emitted only when this changes. */
const viewKey = (view) => `${view.level}|${view.rules.map((r) => r.rule).join(',')}|${view.risk.score}|${view.case?.id ?? ''}`

const badRequest = (errors) => Object.assign(new Error(errors.join('; ')), { status: 400, errors })

export class DetectionService {
  /**
   * @param {object} opts
   * @param {import('../simulation/engine.js').SimulationEngine} opts.engine
   * @param {object} opts.store          see detection/store.js
   * @param {object} [opts.io]           Socket.IO server
   * @param {object} [opts.logger]
   * @param {() => number} [opts.now]
   * @param {(entry: object) => void} [opts.audit]  TODO(Jehal): forward config changes to the audit log (feature 98)
   */
  constructor({ engine, store, io = null, logger = console, now = Date.now, audit } = {}) {
    if (!engine || !store) throw new Error('DetectionService needs an engine and a store')
    this.engine = engine
    this.store = store
    this.io = io
    this.logger = logger
    this.now = now
    this.audit = audit
    this.states = new Map()
    this.resolved = new Map()
    this.stored = { thresholds: {}, baselineLimits: {}, riskWeights: {}, patientThresholds: {} }
    this.caseListeners = new Set()
    this.unsubscribe = null
  }

  // ---- configuration (feature 36) -----------------------------------------------

  async init() {
    const saved = await this.store.loadConfig()
    this.stored = {
      thresholds: saved?.thresholds ?? {},
      baselineLimits: saved?.baselineLimits ?? {},
      riskWeights: saved?.riskWeights ?? {},
      patientThresholds: saved?.patientThresholds ?? {},
      changes: saved?.changes ?? [],
    }
    this.applyConfig()
    return this
  }

  /** Effective settings for one patient: defaults + global overrides + their own threshold overrides. */
  configFor(patientId) {
    const key = String(patientId)
    if (!this.resolved.has(key)) this.resolved.set(key, resolveConfig(this.stored, this.stored.patientThresholds?.[key]))
    return this.resolved.get(key)
  }

  /** Push the effective thresholds into the engine so the dashboard colours match the detection. */
  applyConfig() {
    this.resolved.clear()
    this.engine.setThresholds(resolveConfig(this.stored).thresholds)
    for (const state of this.engine.patients.values()) {
      const own = this.stored.patientThresholds?.[state.id]
      this.engine.setPatientThresholds(state.id, own ? this.configFor(state.id).thresholds : null)
    }
  }

  getConfig() {
    const eff = resolveConfig(this.stored)
    return {
      overrides: {
        thresholds: this.stored.thresholds,
        baselineLimits: this.stored.baselineLimits,
        riskWeights: this.stored.riskWeights,
        patientThresholds: this.stored.patientThresholds,
      },
      effective: eff,
      persistenceTicks: PERSISTENCE_TICKS,
      deescalationTicks: DEESCALATION_TICKS,
      changes: (this.stored.changes ?? []).slice(-20),
    }
  }

  /** Replace the global overrides. A section left out is unchanged; pass {} to reset one. */
  async updateConfig({ thresholds, baselineLimits, riskWeights } = {}, actor = {}) {
    const errors = []
    const next = {}
    if (thresholds !== undefined) {
      const r = validateThresholdOverrides(thresholds)
      errors.push(...r.errors)
      next.thresholds = r.value
    }
    if (baselineLimits !== undefined) {
      const r = validateBaselineLimits(baselineLimits)
      errors.push(...r.errors)
      next.baselineLimits = r.value
    }
    if (riskWeights !== undefined) {
      const r = validateRiskWeights(riskWeights)
      errors.push(...r.errors)
      next.riskWeights = r.value
    }
    if (errors.length) throw badRequest(errors)
    if (!Object.keys(next).length) throw badRequest(['Nothing to change: send thresholds, baselineLimits and/or riskWeights'])

    const before = Object.fromEntries(Object.keys(next).map((k) => [k, this.stored[k]]))
    await this.commit(next, { scope: 'global', summary: `Changed ${Object.keys(next).join(', ')}`, before, after: next }, actor)
    return this.getConfig()
  }

  /** A doctor's per-patient threshold overrides. {} or null removes them. */
  async setPatientThresholds(patientId, overrides, actor = {}) {
    const { value, errors } = validateThresholdOverrides(overrides ?? {})
    if (errors.length) throw badRequest(errors)
    const id = String(patientId)
    const patientThresholds = { ...this.stored.patientThresholds }
    const before = patientThresholds[id] ?? null
    if (Object.keys(value).length) patientThresholds[id] = value
    else delete patientThresholds[id]
    await this.commit({ patientThresholds }, { scope: `patient:${id}`, summary: Object.keys(value).length ? 'Set patient thresholds' : 'Removed patient thresholds', before, after: value }, actor)
    return this.configFor(id)
  }

  async commit(patch, change, actor) {
    const entry = { at: new Date(this.now()), actorRole: actor.role ?? 'presenter', actorId: actor.id, ...change }
    const saved = await this.store.saveConfig(patch, entry)
    this.stored = {
      ...this.stored,
      ...patch,
      changes: saved?.changes ?? [...(this.stored.changes ?? []), entry],
    }
    this.applyConfig()
    this.audit?.(entry)
  }

  // ---- running ------------------------------------------------------------------

  start() {
    if (!this.unsubscribe) this.unsubscribe = this.engine.onUpdate((update) => this.handleUpdate(update))
    return this
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Resolves when all queued database work has finished. For tests and shutdown. */
  async idle() {
    await Promise.all([...this.states.values()].map((s) => s.chain))
  }

  onCaseCreated(fn) {
    this.caseListeners.add(fn)
    return () => this.caseListeners.delete(fn)
  }

  stateFor(id) {
    let st = this.states.get(id)
    if (!st) {
      const engineState = this.engine.patients.get(id)
      st = {
        id,
        patientCode: engineState?.patientCode,
        persist: createPersistence(PERSISTENCE_TICKS),
        basePersist: createPersistence(PERSISTENCE_TICKS),
        level: 0,
        lowerTicks: 0,
        episode: null,
        view: null,
        case: null,
        lastKey: '',
        current: null,
        chain: Promise.resolve(),
      }
      this.states.set(id, st)
      // A patient added after init may already have per-patient thresholds.
      if (this.stored.patientThresholds?.[id]) this.engine.setPatientThresholds(id, this.configFor(id).thresholds)
    }
    return st
  }

  queue(st, fn) {
    st.chain = st.chain.then(fn).catch((err) => this.logger.error?.('[detection]', err))
  }

  /** One reading in. Synchronous: the state machine must not interleave. */
  handleUpdate(update) {
    const id = String(update.patientId)
    const engineState = this.engine.patients.get(id)
    if (!engineState) return
    const st = this.stateFor(id)
    const cfg = this.configFor(id)

    // 1. persistence
    const ranks = statusRanks(update.vitals, cfg.thresholds)
    const confirmed = {}
    const baselineConfirmed = {}
    for (const key of VITAL_KEYS) {
      confirmed[key] = RANK_STATUS[st.persist.push(key, ranks[key])]
      const far = baselineDeviation(key, update.vitals[key], engineState.baseline, cfg.baselineLimits)
      baselineConfirmed[key] = st.basePersist.push(key, far ? 1 : 0) === 1
    }

    // 2. evaluate
    const result = evaluate({
      vitals: update.vitals,
      thresholds: cfg.thresholds,
      confirmed,
      baseline: engineState.baseline,
      limits: cfg.baselineLimits,
      baselineConfirmed,
    })

    // The same rules on this tick's readings alone (no 3-tick wait). A level only steps down after the
    // readings have been clearly below it for 3 ticks in a row, so a brief dip never drops it.
    const instant = evaluate({
      vitals: update.vitals,
      thresholds: cfg.thresholds,
      confirmed: Object.fromEntries(VITAL_KEYS.map((k) => [k, RANK_STATUS[ranks[k]]])),
      baseline: engineState.baseline,
      limits: cfg.baselineLimits,
      baselineConfirmed: Object.fromEntries(VITAL_KEYS.map((k) => [k, Boolean(baselineDeviation(k, update.vitals[k], engineState.baseline, cfg.baselineLimits))])),
    })

    // 3. transition
    const from = st.level
    let escalated = false
    let cleared = false
    if (result.level > st.level) {
      if (st.level === 0) st.episode = randomUUID()
      st.level = result.level
      st.lowerTicks = 0
      st.view = result
      escalated = true
    } else if (result.level < st.level) {
      st.lowerTicks = instant.level >= st.level ? 0 : st.lowerTicks + 1
      if (st.lowerTicks >= DEESCALATION_TICKS) {
        st.level = result.level
        st.lowerTicks = 0
        st.view = result
        cleared = result.level === 0
      }
    } else {
      st.lowerTicks = 0
      st.view = result
    }

    // The fixed part is cheap to recompute, and weights can change at runtime.
    const fixed = engineState.profile ? staticRisk(engineState.profile, cfg.riskWeights) : []
    const risk = computeRisk(fixed, confirmed, baselineConfirmed, st.level, cfg.riskWeights)

    const view = {
      patientId: id,
      patientCode: st.patientCode,
      at: update.at,
      level: st.level,
      severity: severityInfo(st.level),
      primary: st.view?.primary ?? null,
      rules: st.view?.rules ?? [],
      risk,
      confirmed,
      baselineConfirmed,
      episode: st.level ? st.episode : null,
      case: st.case,
      scenario: update.scenario,
      simulated: true,
      notice: SIMULATED_LABEL,
    }
    st.current = view

    const key = viewKey(view)
    if (key !== st.lastKey) {
      st.lastKey = key
      this.emit(id, DETECTION_EVENTS.UPDATE, view)
    }

    // 4. effects
    if (escalated) {
      const snapshot = { ...update.vitals }
      const detection = {
        patient: id,
        patientCode: st.patientCode,
        episode: st.episode,
        at: new Date(update.at),
        severity: st.level,
        severityLabel: SEVERITY[st.level].label,
        primaryRule: result.primary.rule,
        rules: result.rules.map(({ conditions, ...r }) => r),
        snapshot,
        statuses: { ...confirmed },
        scenario: update.scenario,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskBreakdown: risk.breakdown,
      }
      this.queue(st, () => this.recordDetection(st, detection, from))
    } else if (cleared) {
      const episode = st.episode
      st.episode = null
      this.queue(st, () => this.closeEpisode(st, episode, update))
    }
  }

  async recordDetection(st, detection, fromLevel) {
    const saved = await this.store.saveDetection(detection)
    await this.store.logEvent({
      patient: detection.patient,
      type: 'detection',
      at: detection.at,
      message: `${detection.severityLabel}: ${detection.rules[0].message}`,
      severity: EVENT_SEVERITY[detection.severity],
      data: { level: detection.severity, from: fromLevel, rule: detection.primaryRule, rules: detection.rules.map((r) => r.rule), detectionId: String(saved._id), episode: detection.episode },
    })
    if (detection.severity === 3) await this.openCase(st, detection, saved)
  }

  /** Feature 39: exactly one live case per patient. */
  async openCase(st, detection, saved) {
    const deadline = new Date(this.now() + ESCALATION.CONFIRM_COUNTDOWN_MS)
    const doc = {
      patient: detection.patient,
      patientCode: detection.patientCode,
      source: CASE_SOURCE.AUTO_DETECTION,
      severity: 3,
      status: CASE_STATUS.AWAITING_CONFIRMATION,
      detection: {
        rulesFired: detection.rules,
        snapshot: detection.snapshot,
        statuses: detection.statuses,
        scenario: detection.scenario,
        riskScore: detection.riskScore,
        riskBreakdown: detection.riskBreakdown,
      },
      detectionRef: saved._id,
      escalation: { confirmDeadline: deadline, round: 0, radiusKm: ESCALATION.RADII_KM[0], autoSent: false },
      timeline: [
        {
          type: 'detection',
          at: detection.at,
          actorRole: 'system',
          message: `${detection.severityLabel}: ${detection.rules[0].message}`,
          data: { rule: detection.primaryRule, riskScore: detection.riskScore },
        },
      ],
    }
    const { case: found, created } = await this.store.createCaseIfNone(doc)
    st.case = { id: String(found._id), status: found.status, caseNumber: found.caseNumber ?? null, created }
    await this.store.updateDetection(saved._id, { outcome: DETECTION_OUTCOME.CASE_CREATED, case: found._id })
    if (st.current) {
      st.current = { ...st.current, case: st.case }
      st.lastKey = viewKey(st.current) // the next tick must not announce the same state again
      this.emit(st.id, DETECTION_EVENTS.UPDATE, st.current)
    }
    if (created) {
      const payload = {
        caseId: st.case.id,
        patientId: st.id,
        patientCode: st.patientCode,
        severity: 3,
        status: found.status,
        confirmDeadline: deadline.toISOString(),
        rules: detection.rules,
        riskScore: detection.riskScore,
        simulated: true,
        notice: SIMULATED_LABEL,
      }
      this.emit(st.id, DETECTION_EVENTS.CASE_CREATED, payload)
      for (const fn of this.caseListeners) fn(payload)
    }
  }

  async closeEpisode(st, episode, update) {
    await this.store.resolveEpisode(episode)
    await this.store.logEvent({
      patient: st.id,
      type: 'detection',
      at: new Date(update.at),
      message: 'Detection cleared: readings are back in range',
      severity: 'normal',
      data: { level: 0, episode },
    })
    this.emit(st.id, DETECTION_EVENTS.CLEARED, { patientId: st.id, patientCode: st.patientCode, episode, at: update.at, simulated: true })
  }

  emit(id, event, payload) {
    this.io?.to(patientRoom(id)).emit(event, payload)
  }

  /** Detection state of every monitored patient (presenter panel, command centre). */
  statuses() {
    return [...this.engine.patients.keys()].map((id) => this.status(id))
  }

  /** Current detection state for the dashboard (REST). */
  status(patientId) {
    const id = String(patientId)
    const st = this.states.get(id)
    if (st?.current) return st.current
    const engineState = this.engine.patients.get(id)
    if (!engineState) return null
    return {
      patientId: id,
      patientCode: engineState.patientCode,
      at: engineState.lastUpdate?.at ?? null,
      level: 0,
      severity: null,
      primary: null,
      rules: [],
      risk: computeRisk(staticRisk(engineState.profile ?? {}, this.configFor(id).riskWeights), {}, {}, 0, this.configFor(id).riskWeights),
      confirmed: {},
      baselineConfirmed: {},
      episode: null,
      case: null,
      scenario: engineState.scenario,
      simulated: true,
      notice: SIMULATED_LABEL,
    }
  }
}
