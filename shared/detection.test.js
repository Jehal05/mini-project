import { describe, it, expect } from 'vitest'
import { DEFAULT_BASELINE_LIMITS, DEFAULT_RISK_WEIGHTS, PERSISTENCE_TICKS, RISK_LEVELS, riskLevelFor, vitalDirection } from './detection.js'
import { DEFAULT_THRESHOLDS, VITAL_KEYS } from './vitals.js'

describe('shared detection constants (Phase 6)', () => {
  it('uses the plan\'s 3-tick persistence rule', () => {
    expect(PERSISTENCE_TICKS).toBe(3)
  })

  it('has a baseline limit for every vital, each with exactly one kind', () => {
    for (const key of VITAL_KEYS) {
      const kinds = Object.keys(DEFAULT_BASELINE_LIMITS[key])
      expect(kinds).toHaveLength(1)
      expect(['pct', 'drop', 'abs']).toContain(kinds[0])
    }
    expect(DEFAULT_BASELINE_LIMITS.hr.pct).toBe(40) // the plan's example: heart rate up 40%
  })

  it('maps scores to Low, Moderate, High, and never lets a Level 3 look Low', () => {
    expect(riskLevelFor(0)).toBe('low')
    expect(riskLevelFor(RISK_LEVELS.moderate.min - 1)).toBe('low')
    expect(riskLevelFor(RISK_LEVELS.moderate.min)).toBe('moderate')
    expect(riskLevelFor(RISK_LEVELS.high.min)).toBe('high')
    expect(riskLevelFor(10, 2)).toBe('moderate')
    expect(riskLevelFor(10, 3)).toBe('high')
    expect(riskLevelFor(90, 1)).toBe('high')
  })

  it('has non-negative risk weights', () => {
    for (const [k, v] of Object.entries(DEFAULT_RISK_WEIGHTS)) {
      if (typeof v === 'number') expect(v, k).toBeGreaterThanOrEqual(0)
    }
  })

  it('says which way a value is abnormal', () => {
    expect(vitalDirection('hr', 130, DEFAULT_THRESHOLDS)).toBe('high')
    expect(vitalDirection('hr', 45, DEFAULT_THRESHOLDS)).toBe('low')
    expect(vitalDirection('hr', 80, DEFAULT_THRESHOLDS)).toBeNull()
    expect(vitalDirection('hr', undefined, DEFAULT_THRESHOLDS)).toBeNull()
  })
})
