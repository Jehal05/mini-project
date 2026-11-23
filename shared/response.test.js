import { describe, expect, it } from 'vitest'
import { GOLDEN_HOUR, byPriority, goldenHour, priorityScore } from './response.js'

const min = (m) => m * 60_000
const T0 = Date.parse('2026-11-23T10:00:00Z')
const ev = (type, atMin, data) => ({ type, at: new Date(T0 + min(atMin)), data })

describe('priorityScore (95)', () => {
  it('puts severity first, then risk, then waiting, then distance', () => {
    const cases = [
      { id: 'urgent-old', severity: 2, riskScore: 95, waitingMs: min(60), distanceKm: 1 },
      { id: 'critical-new', severity: 3, riskScore: 20, waitingMs: 0, distanceKm: 40 },
      { id: 'critical-risky', severity: 3, riskScore: 80, waitingMs: 0, distanceKm: 40 },
      { id: 'critical-risky-near', severity: 3, riskScore: 80, waitingMs: 0, distanceKm: 2 },
    ]
    expect(cases.sort(byPriority).map((c) => c.id)).toEqual(['critical-risky-near', 'critical-risky', 'critical-new', 'urgent-old'])
  })
  it('caps waiting time so an old low case never beats a new critical one', () => {
    expect(priorityScore({ severity: 1, waitingMs: min(10_000) })).toBeLessThan(priorityScore({ severity: 2 }))
  })
})

describe('goldenHour (105)', () => {
  it('waits before the clocks start, then runs them against the plan targets', () => {
    const fresh = goldenHour({ timeline: [] }, T0)
    expect(fresh.map((g) => g.state)).toEqual(['waiting', 'waiting', 'waiting'])
    const c = { status: 'searching', timeline: [ev('sent', 0)] }
    const [cath] = goldenHour(c, T0 + min(12))
    expect(cath).toMatchObject({ state: 'running', elapsedMs: min(12), overrun: false, targetMs: GOLDEN_HOUR.alertToCathLabMs })
  })
  it('turns a stage red (overrun) when it passes its target, and stops it when it is done', () => {
    const c = { status: 'accepted', timeline: [ev('sent', 0), ev('trip_stage', 8, { stage: 'at_patient' }), ev('trip_stage', 21, { stage: 'patient_on_board' }), ev('preparation', 25, { item: 'cathLabTeamAlerted', value: true })] }
    const [cath, scene, treatment] = goldenHour(c, T0 + min(100))
    expect(cath).toMatchObject({ state: 'done', elapsedMs: min(25), overrun: false })
    expect(scene).toMatchObject({ state: 'done', elapsedMs: min(13), overrun: true }) // 13 min against a 10 min target
    expect(treatment).toMatchObject({ state: 'running', overrun: true }) // 92 min since first contact
  })
  it('freezes the clocks when the case is cancelled', () => {
    const c = { status: 'cancelled', closedAt: new Date(T0 + min(5)), timeline: [ev('sent', 0)] }
    expect(goldenHour(c, T0 + min(500))[0]).toMatchObject({ elapsedMs: min(5), state: 'done' })
  })
})
