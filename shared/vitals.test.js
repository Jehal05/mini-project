import { describe, it, expect } from 'vitest'
import { vitalStatus, worstStatus, readingStatuses, formatVital, mergeThresholds } from './vitals.js'

describe('vitalStatus matches the plan thresholds', () => {
  it.each([
    ['hr', 60, 'normal'], ['hr', 100, 'normal'], ['hr', 59, 'warning'], ['hr', 120, 'warning'],
    ['hr', 120.5, 'critical'], ['hr', 49, 'critical'], ['hr', 50, 'warning'],
    ['spo2', 95, 'normal'], ['spo2', 90, 'warning'], ['spo2', 89, 'critical'],
    ['sys', 139, 'normal'], ['sys', 179, 'warning'], ['sys', 180, 'critical'], ['sys', 89, 'critical'],
    ['temp', 37.5, 'normal'], ['temp', 38.9, 'warning'], ['temp', 39, 'critical'], ['temp', 34.9, 'critical'],
    ['rr', 20, 'normal'], ['rr', 24, 'warning'], ['rr', 25, 'critical'], ['rr', 9, 'critical'],
  ])('%s = %s is %s', (key, value, expected) => {
    expect(vitalStatus(key, value)).toBe(expected)
  })

  it('fills the gaps in the plan table with warning', () => {
    expect(vitalStatus('temp', 35.5)).toBe('warning')
    expect(vitalStatus('temp', 36.0)).toBe('warning')
    expect(vitalStatus('rr', 10)).toBe('warning')
    expect(vitalStatus('rr', 11)).toBe('warning')
  })

  it('treats missing values and unknown keys as normal', () => {
    expect(vitalStatus('hr', undefined)).toBe('normal')
    expect(vitalStatus('glucose', 500)).toBe('normal')
  })
})

describe('worstStatus (feature 29)', () => {
  it('takes the worst vital', () => {
    expect(worstStatus({ hr: 78, spo2: 97, sys: 120 })).toBe('normal')
    expect(worstStatus({ hr: 110, spo2: 97 })).toBe('warning')
    expect(worstStatus({ hr: 130, spo2: 88 })).toBe('critical')
  })

  it('reports each vital', () => {
    expect(readingStatuses({ hr: 130, spo2: 92 })).toEqual({ hr: 'critical', spo2: 'warning' })
  })
})

describe('helpers', () => {
  it('formats with the right decimals', () => {
    expect(formatVital('temp', 37)).toBe('37.0')
    expect(formatVital('hr', 78.6)).toBe('79')
    expect(formatVital('hr', null)).toBe('--')
  })

  it('merges admin overrides per vital', () => {
    const t = mergeThresholds({ hr: { critical: { below: 45, above: 130 } } })
    expect(vitalStatus('hr', 125, t)).toBe('warning')
    expect(vitalStatus('hr', 131, t)).toBe('critical')
    expect(t.spo2.critical.below).toBe(90)
  })
})
