// Feature 91 and 101 logic. Each test names the naive version it is meant to catch.
import { describe, it, expect } from 'vitest'
import { compareVital, compareAll, twinSummary, heartState, pulse } from './twinModel.js'

const baseline = { hr: 78, sys: 124, dia: 75, spo2: 98, temp: 36.8, rr: 15 }

describe('compareVital (feature 91)', () => {
  it('percent is measured against the patient\'s OWN baseline, not against the current value', () => {
    const r = compareVital('hr', 87.4, 78) // +9.4 = 12.05% of 78 (a version dividing by 87.4 says 10.8%)
    expect(r.relation).toBe('above')
    expect(r.text).toBe('Heart rate is 12% above your usual (78 BPM).')
  })
  it('below, and "in line" when the difference is only noise (a version that reports every difference calls 79 vs 78 a change)', () => {
    expect(compareVital('hr', 60, 78).text).toBe('Heart rate is 23% below your usual (78 BPM).')
    const usual = compareVital('hr', 79, 78)
    expect(usual.relation).toBe('usual')
    expect(usual.text).toBe('Heart rate is in line with your usual (78 BPM).')
  })
  it('SpO2 and temperature use plain differences, because a percentage of a percentage is confusing', () => {
    expect(compareVital('spo2', 91, 98).text).toBe('SpO2 is 7 points below your usual (98 %).')
    expect(compareVital('temp', 38.3, 36.8).text).toBe('Temperature is 1.5 °C above your usual (36.8 °C).')
  })
  it('missing live value or baseline is "no data", never a 0% difference', () => {
    expect(compareVital('hr', null, 78)).toMatchObject({ relation: 'no_data', text: 'Heart rate: not enough data yet.' })
    expect(compareVital('hr', 80, undefined).relation).toBe('no_data')
    expect(compareVital('hr', 80, 0).relation).toBe('no_data') // zero baseline would divide by zero
  })
})

describe('twinSummary', () => {
  const rows = (vitals) => compareAll({ vitals }, baseline)
  it('says everything is in line when it is', () => {
    const s = twinSummary(rows({ hr: 79, sys: 125, dia: 76, spo2: 98, temp: 36.8, rr: 15 }), null)
    expect(s.headline).toBe('All your readings are in line with your usual.')
  })
  it('puts the biggest differences first, at most three, and never uses diagnosis words', () => {
    const live = { hr: 138, sys: 172, dia: 104, spo2: 86, temp: 36.9, rr: 28 } // the cardiac_event scenario
    const s = twinSummary(rows(live), { level: 3, primary: { message: 'Heart rate 138 BPM is above 120' } })
    expect(s.lines.length).toBeLessThanOrEqual(3)
    expect(s.lines[0]).toMatch(/^(Breathing rate|Heart rate|Systolic BP|SpO2)/)
    expect(s.headline).toMatch(/differ/)
    expect(JSON.stringify(s)).not.toMatch(/diagnos|disease|heart attack|infarct|you have/i)
    expect(s.detection).toBe('Detection sees a Level 3 pattern: Heart rate 138 BPM is above 120')
  })
  it('live readings but no baseline says the usual readings are missing (not "waiting for live readings")', () => {
    const s = twinSummary(compareAll({ vitals: { hr: 80 } }, undefined), null)
    expect(s.headline).toBe('Your usual readings are not available yet.')
  })
  it('detection wording when nothing is flagged, and when detection is unavailable', () => {
    expect(twinSummary(rows(baseline), { level: 0 }).detection).toBe('Detection sees no abnormal pattern.')
    expect(twinSummary(rows(baseline), null).detection).toBe('Detection status is not available yet.')
  })
  it('with no live data at all it says it is waiting, not that all is fine (a version with an empty-list check says "all in line")', () => {
    const s = twinSummary(compareAll(null, baseline), null)
    expect(s.headline).toBe('Waiting for live readings.')
  })
})

describe('heartState and pulse (feature 101)', () => {
  it('beats at the live heart rate and takes the colour of the worst current status', () => {
    expect(heartState({ vitals: { hr: 138 }, status: 'critical' })).toEqual({ bpm: 138, status: 'critical' })
    expect(heartState({ vitals: { hr: 70 }, status: 'normal' })).toEqual({ bpm: 70, status: 'normal' })
  })
  it('no usable heart rate means no beat (null), not 0 BPM and not a default 60', () => {
    expect(heartState(null)).toEqual({ bpm: null, status: 'normal' })
    expect(heartState({ vitals: { hr: null }, status: 'warning' })).toEqual({ bpm: null, status: 'warning' })
    expect(heartState({ vitals: { hr: 5000 }, status: 'normal' }).bpm).toBeNull() // absurd values are not drawn
  })
  it('pulse repeats every 60/bpm seconds (a fixed 1 Hz animation fails), rests between beats and is 0 without a rate', () => {
    for (const bpm of [60, 120]) {
      const period = 60 / bpm
      expect(pulse(0.13 * period, bpm)).toBeCloseTo(pulse(0.13 * period + period * 3, bpm), 6)
      expect(pulse(0.13 * period, bpm)).toBeGreaterThan(0.5) // the beat itself
      expect(pulse(0.8 * period, bpm)).toBeLessThan(0.05) // the rest
    }
    expect(pulse(10, null)).toBe(0)
  })
})

import { trendText, driftText, restingText } from './twinModel.js'

describe('trend wording (feature 92)', () => {
  it('"not enough data" never reads as steady (a version that maps anything non-rising and non-falling to steady fails)', () => {
    expect(trendText({ state: 'not_enough_data' }, 'hr', 'day')).toBe('not enough data yet')
    expect(trendText(undefined, 'hr', 'day')).toBe('not enough data yet')
  })
  it('says direction and amount in the vital\'s own unit, and "steady" only when it is', () => {
    expect(trendText({ state: 'ok', direction: 'rising', change: 12.4 }, 'hr', 'day')).toBe('rising, about +12 BPM over the day')
    expect(trendText({ state: 'ok', direction: 'falling', change: -1.6 }, 'temp', 'week')).toBe('falling, about -1.6 °C over the week')
    expect(trendText({ state: 'ok', direction: 'steady', change: 0.4 }, 'hr', 'day')).toBe('steady')
  })
  it('drift is only worded when flagged', () => {
    expect(driftText({ state: 'drifting', direction: 'up' }, 'hr')).toBe('Heart rate has drifted up from your usual over several days.')
    expect(driftText({ state: 'none' }, 'hr')).toBeNull()
    expect(driftText({ state: 'not_enough_data' }, 'hr')).toBeNull()
  })
  it('resting heart rate: direction per day, or not enough data', () => {
    expect(restingText({ state: 'ok', direction: 'rising', perDay: 1.5 })).toBe('Resting heart rate is rising, about +1.5 BPM per day.')
    expect(restingText({ state: 'ok', direction: 'steady', perDay: 0.1 })).toBe('Resting heart rate is steady.')
    expect(restingText({ state: 'not_enough_data' })).toBe('Resting heart rate: not enough data yet (needs 3 days).')
  })
})
