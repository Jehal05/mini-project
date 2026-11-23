// Features 21-27 and 29: engine behaviour, no database needed.
import { describe, it, expect, vi } from 'vitest'
import { computeBaseline, ageOf } from '../src/simulation/baseline.js'
import { scenarioTargets, SCENARIOS } from '../src/simulation/scenarios.js'
import { SimulationEngine, seededRng, stepVitals, generateHistory, patientRoom } from '../src/simulation/engine.js'
import { memoryStore } from '../src/simulation/store.js'

const RAHUL = {
  _id: 'p-rahul',
  patientCode: 'HT-2026-0001',
  name: 'Rahul Sharma',
  age: 45,
  cardiacConditions: [{ type: 'heart attack', year: 2022 }],
  conditions: [],
}
const ANANYA = { _id: 'p-ananya', patientCode: 'HT-2026-0002', name: 'Ananya Iyer', age: 25, fitnessLevel: 'high' }
const VIKRAM = { _id: 'p-vikram', patientCode: 'HT-2026-0003', name: 'Vikram Desai', age: 61, conditions: ['hypertension', 'diabetes'] }

function fakeIo() {
  const emits = []
  return { emits, to: (room) => ({ emit: (event, payload) => emits.push({ room, event, payload }) }) }
}

function makeEngine(extra = {}) {
  let t = Date.parse('2026-11-18T08:00:00Z')
  const clock = { now: () => t, advance: (ms) => (t += ms) }
  const store = memoryStore()
  const io = fakeIo()
  const engine = new SimulationEngine({ io, store, rng: seededRng(1), now: clock.now, ...extra })
  return { engine, store, io, clock }
}

async function run(engine, clock, ticks) {
  for (let i = 0; i < ticks; i += 1) {
    clock.advance(2000)
    await engine.tick()
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('feature 27: per-patient baselines', () => {
  it('starts Rahul near 78 BPM', () => {
    expect(computeBaseline(RAHUL).hr).toBeCloseTo(78, 0)
  })

  it('starts a fit 25-year-old lower, and raises BP for hypertension', () => {
    expect(computeBaseline(ANANYA).hr).toBeLessThan(computeBaseline(RAHUL).hr - 10)
    expect(computeBaseline(VIKRAM).sys).toBeGreaterThan(computeBaseline(ANANYA).sys + 15)
  })

  it('works out age from date of birth', () => {
    expect(ageOf({ dateOfBirth: '1981-03-12' }, new Date('2026-11-18'))).toBe(45)
    expect(ageOf({ dateOfBirth: '1981-12-12' }, new Date('2026-11-18'))).toBe(44)
  })

  it('keeps every baseline vital in the normal band', async () => {
    const { vitalStatus } = await import('../../shared/vitals.js')
    for (const p of [RAHUL, ANANYA, VIKRAM]) {
      const b = computeBaseline(p)
      for (const k of ['hr', 'sys', 'dia', 'spo2', 'temp', 'rr']) expect(vitalStatus(k, b[k])).toBe('normal')
    }
  })

  it('reads Normal nearly all the time in the Stable scenario, for every demo patient', async () => {
    const { worstStatus } = await import('../../shared/vitals.js')
    const { displayVitals } = await import('../src/simulation/engine.js')
    for (const p of [RAHUL, ANANYA, VIKRAM]) {
      const rng = seededRng(17)
      const b = computeBaseline(p)
      let v = { ...b }
      let normal = 0
      for (let i = 0; i < 2000; i += 1) {
        v = stepVitals(v, b, rng)
        if (worstStatus(displayVitals(v)) === 'normal') normal += 1
      }
      expect(normal / 2000).toBeGreaterThan(0.99)
    }
  })
})

describe('features 21-25: drift and coupling', () => {
  it('drifts realistically around the baseline when stable', () => {
    const rng = seededRng(3)
    const b = computeBaseline(RAHUL)
    let v = { ...b }
    const hr = []
    const sys = []
    const dia = []
    for (let i = 0; i < 1500; i += 1) {
      v = stepVitals(v, b, rng)
      hr.push(v.hr)
      sys.push(v.sys)
      dia.push(v.dia)
    }
    expect(Math.abs(mean(hr) - b.hr)).toBeLessThan(2)
    expect(Math.max(...hr) - Math.min(...hr)).toBeGreaterThan(3) // it moves
    expect(Math.min(...hr)).toBeGreaterThan(60)
    expect(Math.max(...hr)).toBeLessThan(100) // but stays normal
    expect(Math.max(...v.spo2 ? [v.spo2] : [0])).toBeLessThanOrEqual(100)

    // Systolic and diastolic move together (positive correlation of tick-to-tick changes)
    const ds = sys.slice(1).map((x, i) => x - sys[i])
    const dd = dia.slice(1).map((x, i) => x - dia[i])
    const ms = mean(ds)
    const md = mean(dd)
    const cov = mean(ds.map((x, i) => (x - ms) * (dd[i] - md)))
    const corr = cov / Math.sqrt(mean(ds.map((x) => (x - ms) ** 2)) * mean(dd.map((x) => (x - md) ** 2)))
    expect(corr).toBeGreaterThan(0.5)
  })

  it('never puts SpO2 above 100%', () => {
    const rng = seededRng(9)
    let v = { hr: 70, sys: 120, dia: 80, spo2: 99.9, temp: 36.8, rr: 14 }
    for (let i = 0; i < 500; i += 1) {
      v = stepVitals(v, { ...v, spo2: 99.9 }, rng)
      expect(v.spo2).toBeLessThanOrEqual(100)
    }
  })
})

describe('feature 26: scenarios', () => {
  it('has the five scenarios from the plan', () => {
    expect(SCENARIOS).toEqual(['stable', 'exercise', 'fever', 'hypoxia', 'cardiac_event'])
  })

  it('moves the right vitals in each scenario', () => {
    const b = computeBaseline(RAHUL)
    expect(scenarioTargets('fever', b).temp).toBeGreaterThanOrEqual(39)
    expect(scenarioTargets('hypoxia', b).spo2).toBeLessThan(90)
    expect(scenarioTargets('exercise', b).hr).toBeGreaterThan(b.hr + 15)
  })

  it('cardiac event glides smoothly and meets HR > 120 and SpO2 < 90 within a minute', async () => {
    const { engine, store, clock } = makeEngine()
    await engine.addPatient(RAHUL)
    await run(engine, clock, 5)
    await engine.setScenario('p-rahul', 'cardiac_event')

    let prev = engine.snapshot('p-rahul').vitals.hr
    let maxJump = 0
    for (let i = 0; i < 30; i += 1) {
      await run(engine, clock, 1)
      const hr = engine.snapshot('p-rahul').vitals.hr
      maxJump = Math.max(maxJump, Math.abs(hr - prev))
      prev = hr
    }
    const snap = engine.snapshot('p-rahul')
    expect(snap.scenario).toBe('cardiac_event')
    expect(snap.vitals.hr).toBeGreaterThan(120)
    expect(snap.vitals.spo2).toBeLessThan(90)
    expect(snap.status).toBe('critical')
    expect(maxJump).toBeLessThan(15) // smooth, no jump straight to 138

    const change = store.events.find((e) => e.type === 'scenario_change')
    expect(change.data).toEqual({ from: 'stable', to: 'cardiac_event' })
    expect(store.events.some((e) => e.type === 'status_change' && e.data.to === 'critical')).toBe(true)
  })

  it('rejects unknown scenarios and unknown patients', async () => {
    const { engine } = makeEngine()
    await engine.addPatient(RAHUL)
    await expect(engine.setScenario('p-rahul', 'zombie')).rejects.toThrow(/Unknown scenario/)
    await expect(engine.setScenario('nobody', 'stable')).rejects.toThrow(/not being monitored/)
  })
})

describe('ticking, emitting and saving', () => {
  it('emits vitals:update to patient:<id> every tick, labelled Simulated', async () => {
    const { engine, io, clock } = makeEngine()
    await engine.addPatient(RAHUL)
    await engine.addPatient(ANANYA)
    await run(engine, clock, 3)
    const rahul = io.emits.filter((e) => e.room === patientRoom('p-rahul'))
    expect(rahul).toHaveLength(3)
    expect(rahul[0].event).toBe('vitals:update')
    expect(rahul[0].payload).toMatchObject({ patientId: 'p-rahul', simulated: true, label: 'Simulated', scenario: 'stable' })
    expect(Object.keys(rahul[0].payload.vitals).sort()).toEqual(['dia', 'hr', 'rr', 'spo2', 'sys', 'temp'])
    expect(Number.isInteger(rahul[0].payload.vitals.hr)).toBe(true)
  })

  it('saves a reading every 30 s (feature 28)', async () => {
    const { engine, store, clock } = makeEngine()
    await engine.addPatient(RAHUL)
    await run(engine, clock, 60) // 2 minutes
    const saved = store.readings.filter((r) => r.patient === 'p-rahul')
    expect(saved).toHaveLength(4) // t = 2 s, 32 s, 62 s, 92 s
    expect(saved[0]).toMatchObject({ scenario: 'stable', status: 'normal' })
    expect(saved[0].statuses.hr).toBe('normal')
  })

  it('takes the worst vital as the patient status (feature 29)', async () => {
    const { engine, clock } = makeEngine()
    await engine.addPatient(RAHUL)
    await engine.setScenario('p-rahul', 'hypoxia')
    await run(engine, clock, 40)
    const snap = engine.snapshot('p-rahul')
    expect(snap.statuses.spo2).toBe('critical')
    expect(snap.status).toBe('critical')
  })

  it('does not log status changes for one-tick flickers', async () => {
    const { engine, store, clock } = makeEngine()
    await engine.addPatient(RAHUL)
    await run(engine, clock, 200)
    expect(store.events.filter((e) => e.type === 'status_change')).toHaveLength(0)
  })

  it('resumes from the last saved reading and scenario after a restart', async () => {
    const first = makeEngine()
    await first.engine.addPatient(RAHUL)
    await first.engine.setScenario('p-rahul', 'fever')
    await run(first.engine, first.clock, 20)
    const last = first.store.readings.at(-1)

    const second = new SimulationEngine({ store: first.store, rng: seededRng(5), now: first.clock.now })
    const snap = await second.addPatient(RAHUL)
    expect(snap.scenario).toBe('fever')
    expect(snap.vitals.hr).toBe(last.hr)
  })

  it('lets in-process listeners follow updates (for Phase 6 detection)', async () => {
    const { engine, clock } = makeEngine()
    const fn = vi.fn()
    const off = engine.onUpdate(fn)
    await engine.addPatient(RAHUL)
    await run(engine, clock, 2)
    off()
    await run(engine, clock, 2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('start() and stop() run the 2-second timer', async () => {
    vi.useFakeTimers()
    try {
      const { engine } = makeEngine()
      const spy = vi.spyOn(engine, 'tick').mockResolvedValue()
      engine.start()
      await vi.advanceTimersByTimeAsync(6000)
      engine.stop()
      await vi.advanceTimersByTimeAsync(6000)
      expect(spy).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('history generator', () => {
  it('produces evenly spaced stable readings', () => {
    const b = computeBaseline(RAHUL)
    const h = generateHistory({ baseline: b, from: 0, to: 3600_000, stepMs: 300_000, rng: seededRng(2) })
    expect(h).toHaveLength(13)
    expect(h[1].recordedAt - h[0].recordedAt).toBe(300_000)
    expect(Math.abs(mean(h.map((x) => x.vitals.hr)) - b.hr)).toBeLessThan(5)
  })
})

describe('review fixes: robustness', () => {
  it('item 4: skips a tick while the previous one is still running, and logs it', async () => {
    let release
    const slow = memoryStore()
    slow.saveReading = () => new Promise((r) => (release = r)) // MongoDB "hangs"
    const logger = { warn: vi.fn(), error: vi.fn() }
    let t = Date.parse('2026-11-18T08:00:00Z')
    const engine = new SimulationEngine({ store: slow, rng: seededRng(1), now: () => (t += 2000), logger })
    await engine.addPatient(RAHUL)

    const first = engine.runTick() // starts, blocks on the save
    expect(await engine.runTick()).toBe(false) // overlapping tick is skipped
    expect(engine.skippedTicks).toBe(1)
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/skipped a tick/))

    release()
    expect(await first).toBe(true)
    expect(await engine.runTick()).toBe(true) // runs normally again
  })

  it('item 5: concurrent addPatient calls start monitoring only once', async () => {
    const store = memoryStore()
    const load = vi.spyOn(store, 'loadLastReading')
    const engine = new SimulationEngine({ store, rng: seededRng(1) })
    const [a, b, c] = await Promise.all([engine.addPatient(RAHUL), engine.addPatient(RAHUL), engine.addPatient(RAHUL)])
    expect(load).toHaveBeenCalledTimes(1)
    expect(store.events.filter((e) => e.type === 'monitoring_started')).toHaveLength(1)
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(engine.list()).toHaveLength(1)
    expect(engine.adding.size).toBe(0) // nothing left in flight
  })
})

describe('review 12: real Patient model', () => {
  it("reads Jehal's likely field names (cardiacHistory, existingConditions, object items)", () => {
    const jehalStyle = {
      _id: 'p-j',
      age: 61,
      cardiacHistory: [{ condition: 'Stent', year: 2020 }],
      existingConditions: [{ condition: 'Hypertension' }, { name: 'Diabetes' }],
    }
    const planStyle = { _id: 'p-p', age: 61, cardiacConditions: [{ type: 'stent', year: 2020 }], conditions: ['hypertension', 'diabetes'] }
    expect(computeBaseline(jehalStyle)).toEqual(computeBaseline(planStyle))
  })

  it('ignores missing or malformed lists', () => {
    expect(() => computeBaseline({ age: 30, conditions: 'hypertension', cardiacHistory: null })).not.toThrow()
  })

  it('uses the real Patient model, so the placeholder warning is gone', async () => {
    const { attachSimulation } = await import('../src/simulation/index.js')
    const { Patient } = await import('../src/models/Patient.js')
    const logger = { warn: vi.fn(), error: vi.fn() }
    await attachSimulation({ store: memoryStore(), monitorAll: false, autoStart: false, logger })
    expect(Patient.isHealthTwinPlaceholder).toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringMatching(/PLACEHOLDER Patient model/))
  })
})
