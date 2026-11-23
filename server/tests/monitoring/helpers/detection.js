// Shared test setup for the detection engine.
import { DetectionService } from '../../../src/detection/service.js'
import { memoryDetectionStore } from '../../../src/detection/store.js'
import { computeBaseline } from '../../../src/simulation/baseline.js'
import { SimulationEngine, seededRng } from '../../../src/simulation/engine.js'
import { memoryStore } from '../../../src/simulation/store.js'

export const RAHUL = { _id: 'p-rahul', patientCode: 'HT-2026-0001', name: 'Rahul Sharma', age: 45, cardiacConditions: [{ type: 'heart attack', year: 2022 }], conditions: [] }
export const ANANYA = { _id: 'p-ananya', patientCode: 'HT-2026-0002', name: 'Ananya Iyer', age: 25, fitnessLevel: 'high' }
export const VIKRAM = { _id: 'p-vikram', patientCode: 'HT-2026-0003', name: 'Vikram Desai', age: 61, conditions: ['hypertension', 'diabetes'] }
export const PATIENTS = [RAHUL, ANANYA, VIKRAM]

export function fakeIo() {
  const emits = []
  return { emits, to: (room) => ({ emit: (event, payload) => emits.push({ room, event, payload }) }) }
}

const silent = { warn() {}, error() {}, log() {} }

/**
 * A detection service driven by hand-made readings: no simulation noise, so each rule can be
 * tested exactly. `feed(vitals, n)` sends the same reading n times.
 */
export function manualHarness(patient = RAHUL, { store = memoryDetectionStore(), io = fakeIo() } = {}) {
  const id = String(patient._id)
  const baseline = computeBaseline(patient)
  let t = Date.parse('2026-11-18T08:00:00Z')
  const state = { id, patientCode: patient.patientCode, name: patient.name, profile: patient, baseline, scenario: 'stable', thresholds: null }
  const engine = {
    patients: new Map([[id, state]]),
    thresholds: undefined,
    onUpdate: () => () => {},
    setThresholds(th) {
      this.thresholds = th
    },
    setPatientThresholds(pid, th) {
      this.patients.get(String(pid)).thresholds = th ?? null
    },
  }
  const service = new DetectionService({ engine, store, io, logger: silent, now: () => t })
  const normal = Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, Math.round(v * (k === 'temp' ? 10 : 1)) / (k === 'temp' ? 10 : 1)]))

  const api = {
    id,
    baseline,
    normal,
    service,
    store,
    io,
    engine,
    now: () => t,
    /** Send one reading made of the patient's normal values with some vitals replaced. */
    tick(overrides = {}) {
      t += 2000
      service.handleUpdate({ patientId: id, at: new Date(t).toISOString(), vitals: { ...normal, ...overrides }, scenario: 'stable' })
      return service.status(id)
    },
    feed(overrides, n) {
      let s
      for (let i = 0; i < n; i += 1) s = api.tick(overrides)
      return s
    },
    async settle() {
      await service.idle()
    },
  }
  return api
}

/** The real engine and detection together, on a fake clock, with in-memory stores. */
export async function simHarness({ seed = 1, patients = PATIENTS, store = memoryDetectionStore(), io = fakeIo() } = {}) {
  let t = Date.parse('2026-11-18T08:00:00Z')
  const engine = new SimulationEngine({ io, store: memoryStore(), rng: seededRng(seed), now: () => t, saveEveryMs: 1e12, logger: silent })
  const service = new DetectionService({ engine, store, io, logger: silent, now: () => t })
  await service.init()
  service.start()
  for (const p of patients) await engine.addPatient(p)
  const api = {
    engine,
    service,
    store,
    io,
    now: () => t,
    async scenario(scenario, ids = patients.map((p) => String(p._id))) {
      for (const id of ids) await engine.setScenario(id, scenario)
    },
    /** Run n ticks; returns the highest level each patient reached. */
    async run(n) {
      const max = {}
      for (let i = 0; i < n; i += 1) {
        t += 2000
        await engine.tick()
        for (const p of patients) max[p._id] = Math.max(max[p._id] ?? 0, service.status(p._id).level)
      }
      await service.idle()
      return max
    },
    level: (id) => service.status(id).level,
  }
  return api
}
