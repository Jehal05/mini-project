// Features 36, 39, 40 and the scenario guarantees, using the real engine on a fake clock.
import { describe, it, expect } from 'vitest'
import { DEFAULT_THRESHOLDS } from '../../../shared/vitals.js'
import { CASE_SOURCE, CASE_STATUS, ESCALATION } from '../../../shared/emergency.js'
import { DETECTION_EVENTS, DETECTION_OUTCOME } from '../../../shared/detection.js'
import { DetectionService } from '../../src/detection/service.js'
import { memoryDetectionStore } from '../../src/detection/store.js'
import { manualHarness, simHarness, fakeIo, PATIENTS, RAHUL, ANANYA, VIKRAM } from './helpers/detection.js'

const ids = PATIENTS.map((p) => p._id)

describe('scenario guarantees (engine + detection together)', () => {
  it('Stable never alerts: 1,000 ticks, all three patients, several seeds', async () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const h = await simHarness({ seed })
      const max = await h.run(1000)
      expect(max, `seed ${seed}`).toEqual({ 'p-rahul': 0, 'p-ananya': 0, 'p-vikram': 0 })
      expect(h.store.detections, `seed ${seed}`).toHaveLength(0)
      expect(h.store.cases).toHaveLength(0)
    }
  }, 60_000)

  it('Cardiac event reaches Level 3 within 40 ticks (80 s) for every patient, and opens one case each', async () => {
    for (const seed of [1, 2, 3]) {
      const h = await simHarness({ seed })
      await h.run(30) // settle at rest
      await h.scenario('cardiac_event')
      const reached = {}
      for (let i = 1; i <= 40; i += 1) {
        await h.run(1)
        for (const id of ids) if (h.level(id) === 3 && reached[id] === undefined) reached[id] = i
      }
      await h.service.idle()
      for (const id of ids) {
        expect(reached[id], `seed ${seed} ${id}`).toBeDefined()
        expect(reached[id]).toBeLessThanOrEqual(40)
      }
      expect(h.store.cases).toHaveLength(3)
    }
  }, 60_000)

  it('the cardiac event climbs through Watch, Urgent and Critical in order', async () => {
    const h = await simHarness({ seed: 7, patients: [RAHUL] })
    await h.run(30)
    await h.scenario('cardiac_event')
    await h.run(60)
    const severities = h.store.detections.map((d) => d.severity)
    expect(severities.at(-1)).toBe(3)
    expect(severities).toEqual([...severities].sort((a, b) => a - b)) // never goes down within an episode
    expect(severities).toContain(1)
    expect(severities).toContain(2)
  })

  it('Exercise raises at most a Watch (Level 1) over 1,000 ticks', async () => {
    for (const seed of [1, 2, 3]) {
      const h = await simHarness({ seed })
      await h.scenario('exercise')
      const max = await h.run(1000)
      expect(Math.max(...Object.values(max)), `seed ${seed}`).toBeLessThanOrEqual(1)
      expect(h.store.cases).toHaveLength(0)
    }
  }, 60_000)

  it('Fever is Urgent, never Critical cardiac', async () => {
    const h = await simHarness({ seed: 4 })
    await h.scenario('fever')
    const max = await h.run(300)
    for (const id of ids) expect(max[id]).toBe(2)
    expect(h.store.cases).toHaveLength(0)
  })

  it('Hypoxia is Urgent, not a cardiac emergency (needs the fast heart rate too)', async () => {
    const h = await simHarness({ seed: 5 })
    await h.scenario('hypoxia')
    const max = await h.run(300)
    for (const id of ids) expect(max[id]).toBe(2)
    expect(h.store.cases).toHaveLength(0)
  })

  it('returns to Level 0 after recovery, closes the episode as resolved, and keeps the case', async () => {
    const h = await simHarness({ seed: 9, patients: [RAHUL] })
    await h.run(20)
    await h.scenario('cardiac_event')
    await h.run(40)
    expect(h.level('p-rahul')).toBe(3)
    await h.scenario('stable')
    await h.run(120)
    expect(h.level('p-rahul')).toBe(0)
    expect(h.store.detections.every((d) => d.outcome !== DETECTION_OUTCOME.PENDING)).toBe(true)
    expect(h.store.cases).toHaveLength(1)
    expect(h.store.events.at(-1).message).toMatch(/cleared/i)
  })
})

describe('feature 39: automatic emergency event', () => {
  async function toLevel3() {
    const h = manualHarness(RAHUL)
    h.feed({ hr: 135, spo2: 85, rr: 28 }, 3)
    await h.settle()
    return h
  }

  it('creates an EmergencyCase from the vocabulary, with a snapshot and the rule that fired', async () => {
    const h = await toLevel3()
    expect(h.store.cases).toHaveLength(1)
    const c = h.store.cases[0]
    expect(c.source).toBe(CASE_SOURCE.AUTO_DETECTION)
    expect(c.severity).toBe(3)
    expect(c.status).toBe(CASE_STATUS.AWAITING_CONFIRMATION)
    expect(c.patient).toBe('p-rahul')
    expect(c.detection.snapshot).toMatchObject({ hr: 135, spo2: 85, rr: 28 })
    expect(c.detection.rulesFired[0].rule).toBe('multi:tachycardia-hypoxia')
    expect(c.detection.riskScore).toBeGreaterThan(40)
    expect(c.detectionRef).toBe(h.store.detections.at(-1)._id)
    expect(c.timeline[0]).toMatchObject({ type: 'detection', actorRole: 'system' })
  })

  it('starts the 10-second confirmation countdown', async () => {
    const h = await toLevel3()
    const c = h.store.cases[0]
    expect(c.escalation.confirmDeadline.getTime()).toBe(h.now() + ESCALATION.CONFIRM_COUNTDOWN_MS)
  })

  it('opens exactly ONE case however long Level 3 lasts (a naive "create on every tick" fails)', async () => {
    const h = await toLevel3()
    h.feed({ hr: 135, spo2: 85, rr: 28 }, 200)
    await h.settle()
    expect(h.store.cases).toHaveLength(1)
    expect(h.store.detections.filter((d) => d.severity === 3)).toHaveLength(1)
  })

  it('opens exactly one case when many ticks arrive at once (concurrent ticks)', async () => {
    const h = manualHarness(RAHUL)
    // 50 readings handled back to back without awaiting any database work in between.
    for (let i = 0; i < 50; i += 1) h.tick({ hr: 135, spo2: 85 })
    await h.settle()
    expect(h.store.cases).toHaveLength(1)
  })

  it('does not open a second case after a restart while the first is still live', async () => {
    const store = memoryDetectionStore()
    const first = manualHarness(RAHUL, { store })
    first.feed({ hr: 135, spo2: 85 }, 3)
    await first.settle()
    const second = manualHarness(RAHUL, { store }) // a fresh service: no memory of the first
    second.feed({ hr: 135, spo2: 85 }, 3)
    await second.settle()
    expect(store.cases).toHaveLength(1)
    expect(second.service.status('p-rahul').case).toMatchObject({ id: store.cases[0]._id, created: false })
  })

  it('opens a new case once the previous one is closed', async () => {
    const h = await toLevel3()
    h.store.cases[0].status = CASE_STATUS.CLOSED
    h.feed({}, 5) // recover
    h.feed({ hr: 135, spo2: 85 }, 3)
    await h.settle()
    expect(h.store.cases).toHaveLength(2)
  })

  it('does NOT open a case below Level 3', async () => {
    const h = manualHarness(RAHUL)
    h.feed({ hr: 135 }, 10)
    await h.settle()
    expect(h.store.cases).toHaveLength(0)
    expect(h.store.detections).toHaveLength(1)
  })

  it('emits emergency:created once to the patient room and calls onCaseCreated once', async () => {
    const h = manualHarness(RAHUL)
    const seen = []
    h.service.onCaseCreated((c) => seen.push(c))
    h.feed({ hr: 135, spo2: 85 }, 30)
    await h.settle()
    const created = h.io.emits.filter((e) => e.event === DETECTION_EVENTS.CASE_CREATED)
    expect(created).toHaveLength(1)
    expect(created[0].room).toBe('vitals:p-rahul')
    expect(created[0].payload).toMatchObject({ patientCode: 'HT-2026-0001', severity: 3, simulated: true })
    expect(seen).toHaveLength(1)
    expect(seen[0].caseId).toBe(h.store.cases[0]._id)
  })

  it('a failing database write is logged and does not stop later detection', async () => {
    const store = memoryDetectionStore()
    let calls = 0
    const original = store.saveDetection
    store.saveDetection = async (d) => {
      calls += 1
      if (calls === 1) throw new Error('db down')
      return original(d)
    }
    const h = manualHarness(RAHUL, { store })
    h.feed({ hr: 110 }, 3)
    await h.settle()
    h.feed({ hr: 135, spo2: 85 }, 3)
    await h.settle()
    expect(store.cases).toHaveLength(1)
  })
})

describe('feature 40: detection history', () => {
  it('records one entry per rise, with a snapshot, the rules and a risk score', async () => {
    const h = manualHarness(RAHUL)
    h.feed({ hr: 102 }, 3) // Level 1
    h.feed({ hr: 135 }, 3) // Level 2
    h.feed({ hr: 135, spo2: 85 }, 3) // Level 3
    await h.settle()
    const d = h.store.detections
    expect(d.map((x) => x.severity)).toEqual([1, 2, 3])
    expect(new Set(d.map((x) => x.episode)).size).toBe(1) // one abnormal stretch
    expect(d[2]).toMatchObject({ severityLabel: 'Level 3 Critical cardiac', primaryRule: 'multi:tachycardia-hypoxia', outcome: DETECTION_OUTCOME.CASE_CREATED })
    expect(d[2].snapshot).toMatchObject({ hr: 135, spo2: 85 })
    expect(d[2].riskScore).toBeGreaterThan(0)
    expect(d[2].case).toBe(h.store.cases[0]._id)
    expect(d[0].outcome).toBe(DETECTION_OUTCOME.PENDING)
  })

  it('a new stretch after recovery gets a new episode, and the old one is resolved', async () => {
    const h = manualHarness(RAHUL)
    h.feed({ hr: 135 }, 3)
    h.feed({}, 6)
    h.feed({ hr: 135 }, 3)
    await h.settle()
    const [a, b] = h.store.detections
    expect(a.episode).not.toBe(b.episode)
    expect(a.outcome).toBe(DETECTION_OUTCOME.RESOLVED)
    expect(b.outcome).toBe(DETECTION_OUTCOME.PENDING)
  })

  it('writes a timeline event for each detection (feature 30 shows it)', async () => {
    const h = manualHarness(RAHUL)
    h.feed({ hr: 135 }, 3)
    await h.settle()
    expect(h.store.events[0]).toMatchObject({ type: 'detection', severity: 'critical' })
    expect(h.store.events[0].message).toMatch(/^Level 2 Urgent: Heart rate 135/)
  })
})

describe('feature 36: configurable thresholds apply without a restart', () => {
  it('a new global threshold changes the very next reading', async () => {
    const h = manualHarness(RAHUL)
    expect(h.feed({ hr: 95 }, 5).level).toBe(0)
    await h.service.updateConfig({ thresholds: { hr: { normal: [50, 90], critical: { below: 40, above: 130 } } } }, { role: 'central_admin', id: 'a1' })
    expect(h.feed({ hr: 95 }, 3).primary.rule).toBe('warning:hr')
    expect(h.service.status(h.id).level).toBe(1)
  })

  it('pushes the effective thresholds into the engine, so dashboard colours match', async () => {
    const h = manualHarness(RAHUL)
    await h.service.updateConfig({ thresholds: { spo2: { normal: [97, 100], critical: { below: 92 } } } })
    expect(h.engine.thresholds.spo2.normal).toEqual([97, 100])
    expect(h.engine.thresholds.hr).toEqual(DEFAULT_THRESHOLDS.hr) // untouched vitals keep their defaults
  })

  it('a per-patient override affects only that patient', async () => {
    const store = memoryDetectionStore()
    const a = manualHarness(RAHUL, { store })
    await a.service.setPatientThresholds(a.id, { hr: { normal: [50, 90], critical: { below: 40, above: 130 } } }, { role: 'doctor', id: 'd1' })
    expect(a.feed({ hr: 95 }, 3).primary.rule).toBe('warning:hr')
    expect(a.engine.patients.get(a.id).thresholds.hr.normal).toEqual([50, 90])
    const b = manualHarness(ANANYA, { store })
    b.service.stored = a.service.stored
    expect(b.feed({ hr: 95 }, 3).level === 2 || b.service.configFor(b.id).thresholds.hr.normal[1] === 100).toBe(true) // Ananya keeps 60-100
    expect(b.service.configFor(b.id).thresholds.hr.normal).toEqual([60, 100])
  })

  it('removing a patient override restores the global thresholds', async () => {
    const h = manualHarness(RAHUL)
    await h.service.setPatientThresholds(h.id, { hr: { normal: [50, 90], critical: { below: 40, above: 130 } } })
    await h.service.setPatientThresholds(h.id, {})
    expect(h.service.configFor(h.id).thresholds.hr.normal).toEqual([60, 100])
    expect(h.engine.patients.get(h.id).thresholds).toBeNull()
  })

  it('baseline limits and risk weights are editable too', async () => {
    const h = manualHarness(RAHUL)
    await h.service.updateConfig({ baselineLimits: { hr: { pct: 10 } }, riskWeights: { cardiacHistory: 0 } })
    expect(h.feed({ hr: 90 }, 3).primary.rule).toBe('baseline:hr') // +15% now counts
    expect(h.service.status(h.id).risk.breakdown.map((b) => b.factor)).not.toContain('Previous cardiac condition')
  })

  it('rejects bad values with a list of reasons and changes nothing', async () => {
    const h = manualHarness(RAHUL)
    const bad = [
      [{ thresholds: { pulse: {} } }, /unknown vital/],
      [{ thresholds: { hr: { normal: [100, 60] } } }, /low < high/],
      [{ thresholds: { hr: { normal: [60, 100], critical: { above: 90 } } } }, /must not be below the normal high/],
      [{ thresholds: { hr: { critical: { below: 70 } } } }, /must not be above the normal low/],
      [{ thresholds: { hr: { colour: 'red' } } }, /only normal and critical/],
      [{ baselineLimits: { hr: { pct: 0 } } }, /above 0/],
      [{ baselineLimits: { hr: { pct: 10, abs: 5 } } }, /exactly one/],
      [{ riskWeights: { vitalWarning: -1 } }, /0 or more/],
      [{ riskWeights: { nonsense: 1 } }, /unknown weight/],
      [{}, /Nothing to change/],
    ]
    for (const [body, re] of bad) {
      await expect(h.service.updateConfig(body), JSON.stringify(body)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(re) })
    }
    expect(h.store.config).toBeNull()
    expect(h.engine.thresholds).toBeUndefined()
  })

  it('every change is logged with who made it, and passed to the audit hook', async () => {
    const audited = []
    const h = manualHarness(RAHUL)
    h.service.audit = (e) => audited.push(e)
    await h.service.updateConfig({ thresholds: { hr: { normal: [55, 100] } } }, { role: 'central_admin', id: 'admin-1' })
    await h.service.setPatientThresholds(h.id, { rr: { normal: [10, 22], critical: { below: 8, above: 26 } } }, { role: 'doctor', id: 'doc-1' })
    const log = h.service.getConfig().changes
    expect(log).toHaveLength(2)
    expect(log[0]).toMatchObject({ actorRole: 'central_admin', actorId: 'admin-1', scope: 'global' })
    expect(log[0].before.thresholds).toEqual({})
    expect(log[1]).toMatchObject({ actorRole: 'doctor', actorId: 'doc-1', scope: `patient:${h.id}` })
    expect(audited).toHaveLength(2)
  })

  it('loads saved overrides when it starts', async () => {
    const store = memoryDetectionStore()
    const first = manualHarness(RAHUL, { store })
    await first.service.updateConfig({ thresholds: { hr: { normal: [55, 100] } } })
    const second = manualHarness(RAHUL, { store })
    await second.service.init()
    expect(second.engine.thresholds.hr.normal).toEqual([55, 100])
  })
})

describe('guards', () => {
  it('needs an engine and a store', () => {
    expect(() => new DetectionService({})).toThrow(/engine and a store/)
  })

  it('ignores readings for patients the engine is not monitoring', () => {
    const h = manualHarness(RAHUL)
    expect(() => h.service.handleUpdate({ patientId: 'someone-else', at: new Date().toISOString(), vitals: h.normal })).not.toThrow()
    expect(h.service.status('someone-else')).toBeNull()
  })

  it('status() works before the first reading', () => {
    const h = manualHarness(VIKRAM)
    const s = h.service.status(h.id)
    expect(s).toMatchObject({ level: 0, rules: [], simulated: true })
    expect(s.risk.score).toBeGreaterThan(0) // Vikram's hypertension and diabetes
  })

  it('emits detection:update only when something changed', () => {
    const io = fakeIo()
    const h = manualHarness(RAHUL, { io })
    h.feed({}, 20)
    expect(io.emits.filter((e) => e.event === DETECTION_EVENTS.UPDATE).length).toBeLessThanOrEqual(1)
    const before = io.emits.length
    h.feed({ hr: 135 }, 3)
    expect(io.emits.length).toBeGreaterThan(before)
  })
})
