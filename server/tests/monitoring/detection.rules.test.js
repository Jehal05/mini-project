// Features 31-38: the persistence rule, the rule table, precedence, baseline comparison, severity.
// Readings are hand-made, so every test pins down one rule.
import { describe, it, expect } from 'vitest'
import { createPersistence } from '../../src/detection/persistence.js'
import { RULES, describeRules } from '../../src/detection/rules.js'
import { baselineDeviation, evaluate } from '../../src/detection/evaluate.js'
import { computeRisk, staticRisk } from '../../src/detection/risk.js'
import { DEFAULT_THRESHOLDS, VITAL_KEYS } from '../../../shared/vitals.js'
import { DEFAULT_BASELINE_LIMITS, DEESCALATION_TICKS, PERSISTENCE_TICKS } from '../../../shared/detection.js'
import { manualHarness, RAHUL, ANANYA, VIKRAM } from './helpers/detection.js'

const rulesOf = (s) => s.rules.map((r) => r.rule)

describe('persistence: 3 ticks in a row (features 31-33)', () => {
  it('confirms only after N consecutive abnormal readings', () => {
    const p = createPersistence(3)
    expect(p.push('hr', 2)).toBe(0)
    expect(p.push('hr', 2)).toBe(0)
    expect(p.push('hr', 2)).toBe(2)
  })

  it('confirms the WEAKEST level in the window', () => {
    const p = createPersistence(3)
    p.push('hr', 2)
    p.push('hr', 1)
    expect(p.push('hr', 2)).toBe(1) // critical, warning, critical is only a confirmed warning
  })

  it('a single normal reading breaks the run', () => {
    const p = createPersistence(3)
    p.push('hr', 2)
    p.push('hr', 2)
    p.push('hr', 0)
    expect(p.push('hr', 2)).toBe(0)
  })

  it('tracks each vital on its own', () => {
    const p = createPersistence(2)
    p.push('hr', 2)
    p.push('spo2', 0)
    expect(p.push('hr', 2)).toBe(2)
    expect(p.push('spo2', 2)).toBe(0)
  })

  it('uses 3 ticks by default, as in the plan', () => {
    expect(createPersistence().required).toBe(PERSISTENCE_TICKS)
    expect(PERSISTENCE_TICKS).toBe(3)
  })
})

describe('features 31-33: single-vital detection', () => {
  it('ignores a one-tick spike (a naive "fire on first abnormal reading" fails this)', () => {
    const h = manualHarness()
    h.tick({ hr: 135 })
    expect(h.tick().level).toBe(0)
    h.tick({ hr: 135 })
    h.tick({ hr: 135 })
    expect(h.tick().level).toBe(0) // never three in a row
  })

  it('ignores two abnormal ticks, fires on the third', () => {
    const h = manualHarness()
    expect(h.tick({ hr: 135 }).level).toBe(0)
    expect(h.tick({ hr: 135 }).level).toBe(0)
    const s = h.tick({ hr: 135 })
    expect(s.level).toBe(2)
    expect(s.primary.rule).toBe('critical:hr')
  })

  it('a sustained abnormality stays flagged', () => {
    const h = manualHarness()
    const s = h.feed({ hr: 135 }, 30)
    expect(s.level).toBe(2)
  })

  it('heart rate Warning is Level 1 and names the bound it crossed', () => {
    const h = manualHarness()
    const s = h.feed({ hr: 102 }, 3)
    expect(s.level).toBe(1)
    expect(s.primary.rule).toBe('warning:hr')
    expect(s.primary.threshold).toBe(DEFAULT_THRESHOLDS.hr.normal[1])
    expect(s.primary.message).toMatch(/Heart rate 102 BPM is above 100/)
  })

  it('heart rate Critical low is also Level 2', () => {
    const s = manualHarness().feed({ hr: 45 }, 3)
    expect(s.level).toBe(2)
    expect(s.primary.message).toMatch(/below 50/)
  })

  it('a Critical vital does not also list the Warning rule for itself', () => {
    const s = manualHarness().feed({ hr: 135 }, 3)
    expect(rulesOf(s)).toContain('critical:hr')
    expect(rulesOf(s)).not.toContain('warning:hr')
  })

  it('feature 32: systolic and diastolic are detected separately', () => {
    expect(manualHarness().feed({ sys: 185 }, 3).primary.rule).toBe('critical:sys')
    expect(manualHarness().feed({ dia: 125 }, 3).primary.rule).toBe('critical:dia')
    expect(manualHarness().feed({ sys: 150 }, 3).primary.rule).toBe('warning:sys')
    expect(manualHarness().feed({ sys: 85 }, 3).primary.rule).toBe('critical:sys') // low side too
  })

  it('feature 33: SpO2 Warning 90-94 and Critical below 90', () => {
    expect(manualHarness().feed({ spo2: 92 }, 3).primary.rule).toBe('warning:spo2')
    const at90 = rulesOf(manualHarness().feed({ spo2: 90 }, 3))
    expect(at90).toContain('warning:spo2') // 90 is still Warning, not Critical
    expect(at90).not.toContain('critical:spo2')
    expect(manualHarness().feed({ spo2: 89 }, 3).primary.rule).toBe('critical:spo2')
  })

  it('temperature and respiratory rate are covered too', () => {
    expect(manualHarness().feed({ temp: 39.2 }, 3).primary.rule).toBe('critical:temp')
    expect(manualHarness().feed({ temp: 37.8 }, 3).primary.rule).toBe('warning:temp')
    expect(manualHarness().feed({ rr: 26 }, 3).primary.rule).toBe('critical:rr')
    expect(manualHarness().feed({ rr: 22 }, 3).primary.rule).toBe('warning:rr')
  })

  it('normal readings never fire anything', () => {
    const h = manualHarness()
    const s = h.feed({}, 50)
    expect(s.level).toBe(0)
    expect(s.rules).toEqual([])
  })
})

describe('feature 34: multi-parameter rules outrank single ones', () => {
  it('heart rate > 120 with SpO2 < 90 is Level 3 (the plan\'s own example)', () => {
    const s = manualHarness().feed({ hr: 130, spo2: 85 }, 3)
    expect(s.level).toBe(3)
    expect(s.primary.rule).toBe('multi:tachycardia-hypoxia')
  })

  it('the combined rule is listed first, ahead of the single rules it contains', () => {
    const s = manualHarness().feed({ hr: 130, spo2: 85 }, 3)
    expect(rulesOf(s)[0]).toBe('multi:tachycardia-hypoxia')
    expect(rulesOf(s)).toEqual(expect.arrayContaining(['critical:hr', 'critical:spo2']))
    expect(s.rules[0].level).toBeGreaterThan(s.rules[1].level)
    const levels = s.rules.map((r) => r.level)
    expect(levels).toEqual([...levels].sort((a, b) => b - a)) // highest level first
  })

  it('when two Level 3 rules fire, the more specific one (more conditions) is primary', () => {
    const s = manualHarness().feed({ hr: 130, spo2: 85, sys: 150, rr: 23 }, 3)
    expect(rulesOf(s).slice(0, 2)).toEqual(['multi:tachycardia-hypertension-breathless', 'multi:tachycardia-hypoxia'])
    expect(s.primary.conditions).toBe(3)
  })

  it('precedence does not depend on table order (a custom table in the wrong order still ranks Level 3 first)', () => {
    const rule = (id) => RULES.find((r) => r.id === id)
    const ctx = {
      vitals: { hr: 130, spo2: 85, sys: 124, rr: 15 },
      thresholds: DEFAULT_THRESHOLDS,
      confirmed: { hr: 'critical', spo2: 'critical' },
      baseline: {},
      limits: DEFAULT_BASELINE_LIMITS,
      baselineConfirmed: {},
    }
    const backwards = [rule('critical:hr'), rule('critical:spo2'), rule('multi:tachycardia-hypoxia')]
    const r = evaluate(ctx, backwards)
    expect(r.rules.map((x) => x.rule)).toEqual(['multi:tachycardia-hypoxia', 'critical:hr', 'critical:spo2'])
    expect(r.level).toBe(3)
  })

  it('heart rate high + BP low + SpO2 low is Level 3 (shock pattern)', () => {
    const s = manualHarness().feed({ hr: 110, sys: 85, spo2: 92 }, 3)
    expect(s.level).toBe(3)
    expect(s.primary.rule).toBe('multi:shock-pattern')
  })

  it('very slow heart rate with very low BP is Level 3', () => {
    const s = manualHarness().feed({ hr: 42, sys: 80 }, 3)
    expect(s.primary.rule).toBe('multi:bradycardia-hypotension')
    expect(s.level).toBe(3)
  })

  it('fast heart rate with high BP and fast breathing is Level 3', () => {
    const s = manualHarness().feed({ hr: 130, sys: 150, rr: 23 }, 3)
    expect(s.primary.rule).toBe('multi:tachycardia-hypertension-breathless')
    expect(s.level).toBe(3)
  })

  it('needs every condition: fast heart rate with only a Warning SpO2 is Level 2, not 3 (a naive "any two abnormal" fails)', () => {
    const s = manualHarness().feed({ hr: 130, spo2: 93 }, 3)
    expect(s.level).toBe(2)
    expect(s.primary.rule).toBe('critical:hr')
  })

  it('direction matters: a very SLOW heart rate with low SpO2 is not the tachycardia rule', () => {
    const s = manualHarness().feed({ hr: 45, spo2: 85 }, 3)
    expect(rulesOf(s)).not.toContain('multi:tachycardia-hypoxia')
    expect(s.level).toBe(2)
  })

  it('each condition must hold for 3 ticks: one late-arriving vital delays Level 3', () => {
    const h = manualHarness()
    h.feed({ hr: 130 }, 3) // Level 2 already
    expect(h.tick({ hr: 130, spo2: 85 }).level).toBe(2)
    expect(h.tick({ hr: 130, spo2: 85 }).level).toBe(2)
    expect(h.tick({ hr: 130, spo2: 85 }).level).toBe(3)
  })

  it('every multi rule uses only vitals and directions that exist', () => {
    for (const r of RULES.filter((x) => x.type === 'multi')) {
      expect(r.all.length).toBeGreaterThanOrEqual(2)
      for (const c of r.all) {
        expect(VITAL_KEYS).toContain(c.vital)
        expect(['warning', 'critical']).toContain(c.min)
        expect(['high', 'low']).toContain(c.dir)
      }
    }
  })
})

describe('feature 35: comparison with the patient\'s own baseline', () => {
  it('flags a large change that is still inside the normal range', () => {
    const h = manualHarness(ANANYA) // baseline heart rate about 66
    const s = h.feed({ hr: 95 }, 3) // +44%, yet 60-100 is normal
    expect(s.level).toBe(2)
    expect(s.primary.rule).toBe('baseline:hr')
    expect(s.primary.message).toMatch(/above this patient's own baseline/)
    expect(s.confirmed.hr).toBe('normal')
  })

  it('judges the same reading against each patient\'s own baseline', () => {
    expect(manualHarness(ANANYA).feed({ hr: 95 }, 3).level).toBe(2)
    expect(manualHarness(RAHUL).feed({ hr: 95 }, 3).level).toBe(0) // baseline 78: only +22%
  })

  it('also fires on a large fall', () => {
    const s = manualHarness(RAHUL).feed({ hr: 62 }, 3) // 78 -> 62 is -21%, inside the 40% limit
    expect(s.level).toBe(0)
    const limits = { hr: { pct: 20 } }
    expect(baselineDeviation('hr', 62, { hr: 78 }, limits)).toMatchObject({ change: expect.any(Number) })
    expect(baselineDeviation('hr', 62, { hr: 78 }, limits).change).toBeLessThan(0)
  })

  it('needs 3 ticks in a row too', () => {
    const h = manualHarness(ANANYA)
    h.feed({ hr: 95 }, 2)
    expect(h.tick().level).toBe(0)
  })

  it('works for hypertensive baselines: BP is compared with the patient\'s own', () => {
    const h = manualHarness(VIKRAM) // baseline systolic about 130
    const s = h.feed({ sys: 166 }, 3) // +27%, Warning range
    expect(s.level).toBe(2) // Level 2 outranks the Level 1 Warning
    expect(rulesOf(s)).toEqual(['baseline:sys', 'warning:sys'])
  })

  it('SpO2 uses an absolute drop, temperature an absolute change', () => {
    expect(baselineDeviation('spo2', 92, { spo2: 98.4 }, DEFAULT_BASELINE_LIMITS)).not.toBeNull()
    expect(baselineDeviation('spo2', 94, { spo2: 98.4 }, DEFAULT_BASELINE_LIMITS)).toBeNull()
    expect(baselineDeviation('spo2', 100, { spo2: 90 }, DEFAULT_BASELINE_LIMITS)).toBeNull() // a rise is not a drop
    expect(baselineDeviation('temp', 38.1, { temp: 36.8 }, DEFAULT_BASELINE_LIMITS)).not.toBeNull()
  })

  it('ignores missing baselines and values', () => {
    expect(baselineDeviation('hr', 90, {}, DEFAULT_BASELINE_LIMITS)).toBeNull()
    expect(baselineDeviation('hr', undefined, { hr: 70 }, DEFAULT_BASELINE_LIMITS)).toBeNull()
  })
})

describe('feature 38: severity levels with reasons', () => {
  it('Level 1 Watch, Level 2 Urgent, Level 3 Critical, each with its label', () => {
    expect(manualHarness().feed({ hr: 102 }, 3).severity.label).toBe('Level 1 Watch')
    expect(manualHarness().feed({ hr: 135 }, 3).severity.label).toBe('Level 2 Urgent')
    expect(manualHarness().feed({ hr: 135, spo2: 85 }, 3).severity.label).toBe('Level 3 Critical cardiac')
  })

  it('every reason says what it saw, as text and as numbers', () => {
    const s = manualHarness().feed({ hr: 135, spo2: 85 }, 3)
    for (const r of s.rules) {
      expect(r.message.length).toBeGreaterThan(10)
      expect(r.level).toBeGreaterThanOrEqual(1)
    }
    const hr = s.rules.find((r) => r.rule === 'critical:hr')
    expect(hr).toMatchObject({ vital: 'hr', value: 135, threshold: 120 })
  })

  it('the rule table is data: every rule has an id, a type and a level', () => {
    const described = describeRules()
    expect(described.length).toBe(RULES.length)
    expect(new Set(described.map((r) => r.id)).size).toBe(described.length) // unique ids
    for (const r of described) expect([1, 2, 3]).toContain(r.level)
  })

  it('evaluate() is pure and can be called with a custom rule table', () => {
    const only = [RULES.find((r) => r.id === 'warning:hr')]
    const ctx = {
      vitals: { hr: 110 },
      thresholds: DEFAULT_THRESHOLDS,
      confirmed: { hr: 'warning' },
      baseline: {},
      limits: DEFAULT_BASELINE_LIMITS,
      baselineConfirmed: {},
    }
    expect(evaluate(ctx, only).level).toBe(1)
    expect(evaluate({ ...ctx, confirmed: { hr: 'normal' } }, only).level).toBe(0)
  })
})

describe('the displayed level steps down only after it holds', () => {
  it('stays up for the first lower ticks, then drops and closes the episode', async () => {
    const h = manualHarness()
    h.feed({ hr: 135 }, 3)
    for (let i = 1; i < DEESCALATION_TICKS; i += 1) expect(h.tick().level).toBe(2)
    expect(h.tick().level).toBe(0)
    await h.settle()
    expect(h.store.detections[0].outcome).toBe('resolved')
    expect(h.store.events.at(-1).message).toMatch(/cleared/i)
  })

  it('a brief dip does not reset the level (no flapping)', () => {
    const h = manualHarness()
    h.feed({ hr: 135 }, 3)
    h.tick()
    h.tick()
    expect(h.tick({ hr: 135 }).level).toBe(2) // abnormal again before the hold ran out
    h.tick()
    h.tick()
    expect(h.tick({ hr: 135 }).level).toBe(2)
  })

  it('while holding a higher level it keeps showing the rules that raised it', () => {
    const h = manualHarness()
    h.feed({ hr: 135 }, 3)
    const s = h.tick()
    expect(s.level).toBe(2)
    expect(s.primary.rule).toBe('critical:hr')
  })
})

describe('feature 37/93: the risk score', () => {
  it('adds fixed factors from the patient profile, each listed in the breakdown', () => {
    const items = staticRisk(RAHUL)
    expect(items.map((i) => i.factor)).toEqual(expect.arrayContaining(['Age 45', 'Previous cardiac condition']))
    const vik = staticRisk(VIKRAM).map((i) => i.factor)
    expect(vik).toEqual(expect.arrayContaining(['Hypertension', 'Diabetes']))
    expect(staticRisk(ANANYA)).toEqual([])
  })

  it('reads family cardiac history when the profile has it', () => {
    const items = staticRisk({ age: 40, familyHistory: ['father: heart attack at 52'] })
    expect(items.map((i) => i.factor)).toContain('Family cardiac history')
  })

  it('rises with current abnormalities and stays within 0-100', () => {
    const fixed = staticRisk(RAHUL)
    const calm = computeRisk(fixed, {}, {}, 0)
    const warn = computeRisk(fixed, { hr: 'warning' }, {}, 1)
    const crit = computeRisk(fixed, { hr: 'critical', spo2: 'critical', rr: 'critical', sys: 'warning', dia: 'warning' }, {}, 3)
    expect(warn.score).toBeGreaterThan(calm.score)
    expect(crit.score).toBeGreaterThan(warn.score)
    expect(crit.score).toBeLessThanOrEqual(100)
    expect(computeRisk([], Object.fromEntries(VITAL_KEYS.map((k) => [k, 'critical'])), Object.fromEntries(VITAL_KEYS.map((k) => [k, true])), 3).score).toBe(100)
  })

  it('a Level 3 is High and a resting patient is Low; the breakdown sums to the score', () => {
    const fixed = staticRisk(RAHUL)
    expect(computeRisk(fixed, {}, {}, 0).level).toBe('low')
    const hi = computeRisk(fixed, { hr: 'critical', spo2: 'critical' }, {}, 3)
    expect(hi.level).toBe('high')
    expect(hi.breakdown.reduce((s, b) => s + b.points, 0)).toBeCloseTo(hi.score, 0)
  })

  it('weights are editable', () => {
    const fixed = staticRisk(RAHUL, { ...{ ageMax: 15, agePerYearOver30: 0.35 }, cardiacHistory: 0 })
    expect(fixed.map((i) => i.factor)).not.toContain('Previous cardiac condition')
  })
})
