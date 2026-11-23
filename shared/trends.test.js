// Feature 92: trend statistics. Each test names the naive version it is meant to catch.
import { describe, it, expect } from 'vitest'
import { slope, analyzeSeries, restingHr, driftOf, TREND_MIN_CHANGE } from './trends.js'

const H = 3_600_000
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)
/** points every `stepMin` minutes ending at NOW, value from f(hoursAgo) */
const series = (hours, stepMin, f) => {
  const out = []
  for (let m = hours * 60; m >= 0; m -= stepMin) out.push({ t: NOW - m * 60_000, v: f(m / 60) })
  return out
}

describe('slope', () => {
  it('is the least-squares slope per hour, not (last - first) (a version using the endpoints is thrown off by one noisy point)', () => {
    const pts = series(10, 30, (h) => 80 - h * 1) // falls 1 per hour going back => rises 1/h forward
    pts[pts.length - 1].v += 15 // one noisy last reading
    const s = slope(pts)
    expect(s.perHour).toBeGreaterThan(0.7)
    expect(s.perHour).toBeLessThan(1.6) // endpoints would say about 2.5
  })
  it('is 0 for a flat line and null with fewer than 2 points', () => {
    expect(slope(series(5, 30, () => 70)).perHour).toBeCloseTo(0, 10)
    expect(slope([{ t: 1, v: 1 }])).toBeNull()
    expect(slope([])).toBeNull()
  })
})

describe('analyzeSeries', () => {
  it('rising, falling and steady are judged against a per-vital minimum change', () => {
    const up = analyzeSeries(series(24, 5, (h) => 70 + (24 - h) * 0.5), { key: 'hr', windowHours: 24, now: NOW }) // +12 over the day
    expect(up).toMatchObject({ state: 'ok', direction: 'rising' })
    expect(up.change).toBeCloseTo(12, 0)
    const down = analyzeSeries(series(24, 5, (h) => 90 - (24 - h) * 0.5), { key: 'hr', windowHours: 24, now: NOW })
    expect(down.direction).toBe('falling')
    const flat = analyzeSeries(series(24, 5, (h) => 72 + Math.sin(h) * 1), { key: 'hr', windowHours: 24, now: NOW })
    expect(flat.direction).toBe('steady') // noise of +-1 BPM is not a trend
  })
  it('the same change means different things for different vitals (a one-size threshold fails one of them)', () => {
    const t = series(24, 5, (h) => 36.8 + (24 - h) * (0.5 / 24)) // +0.5 C
    expect(analyzeSeries(t, { key: 'temp', windowHours: 24, now: NOW }).direction).toBe('rising')
    const hr = series(24, 5, (h) => 72 + (24 - h) * (0.5 / 24)) // +0.5 BPM
    expect(analyzeSeries(hr, { key: 'hr', windowHours: 24, now: NOW }).direction).toBe('steady')
    expect(TREND_MIN_CHANGE.temp).toBeLessThan(TREND_MIN_CHANGE.hr)
  })
  it('says "not enough data" instead of steady or zero when points are few or cover little of the window', () => {
    expect(analyzeSeries([], { key: 'hr', windowHours: 24, now: NOW })).toMatchObject({ state: 'not_enough_data' })
    const few = series(24, 5 * 60, () => 70) // 5 points
    expect(analyzeSeries(few, { key: 'hr', windowHours: 24, now: NOW }).state).toBe('not_enough_data')
    const short = series(3, 5, () => 70) // plenty of points but only 3 h of a 24 h window
    const r = analyzeSeries(short, { key: 'hr', windowHours: 24, now: NOW })
    expect(r.state).toBe('not_enough_data')
    expect(r.direction).toBeUndefined()
  })
  it('ignores null readings (a version that treats null as 0 sees a huge fall)', () => {
    const pts = series(24, 5, () => 72)
    for (let i = 0; i < pts.length; i += 7) pts[i].v = null
    expect(analyzeSeries(pts, { key: 'hr', windowHours: 24, now: NOW }).direction).toBe('steady')
  })
  it('reports the mean and the latest value', () => {
    const r = analyzeSeries(series(24, 5, () => 72), { key: 'hr', windowHours: 24, now: NOW })
    expect(r.mean).toBeCloseTo(72, 5)
    expect(r.latest).toBe(72)
  })
})

describe('restingHr', () => {
  it('uses the calm end of each day, so an exercise spike does not move it (a daily mean would)', () => {
    const pts = series(24 * 7, 30, (h) => (Math.floor(h) % 24 === 5 ? 140 : 66)) // one hot hour a day
    const r = restingHr(pts, { days: 7, now: NOW })
    expect(r.days).toHaveLength(7)
    for (const d of r.days) expect(d.value).toBeCloseTo(66, 0)
    expect(r.state).toBe('ok')
    expect(r.direction).toBe('steady')
  })
  it('shows a rising resting rate over days, oldest day first', () => {
    const pts = series(24 * 7, 30, (h) => 62 + ((24 * 7 - h) / 24) * 1.5) // +1.5 BPM per day
    const r = restingHr(pts, { days: 7, now: NOW })
    expect(r.direction).toBe('rising')
    expect(r.perDay).toBeCloseTo(1.5, 0)
    expect(r.days[0].value).toBeLessThan(r.days[6].value)
  })
  it('a day with too little data is null, and under 3 usable days there is no trend (not "steady")', () => {
    const pts = series(48, 30, () => 66) // two days only
    const r = restingHr(pts, { days: 7, now: NOW })
    expect(r.days.filter((d) => d.value === null).length).toBeGreaterThanOrEqual(5)
    expect(r.state).toBe('not_enough_data')
  })
})

describe('driftOf (days-long movement away from the patient\'s own baseline)', () => {
  const daily = (f) => series(24 * 7, 30, (h) => f((24 * 7 - h) / 24))
  it('flags a vital that has moved away from baseline AND is still moving that way', () => {
    const r = driftOf(daily((d) => 78 + d * 1.5), { key: 'hr', baseline: 78, days: 7, now: NOW })
    expect(r.state).toBe('drifting')
    expect(r.direction).toBe('up')
  })
  it('does not flag a high-but-steady vital (a "distance from baseline only" version does)', () => {
    const r = driftOf(daily(() => 90), { key: 'hr', baseline: 78, days: 7, now: NOW })
    expect(r.state).toBe('none')
  })
  it('does not flag a vital that is moving back towards baseline', () => {
    const r = driftOf(daily((d) => 92 - d * 2), { key: 'hr', baseline: 78, days: 7, now: NOW })
    expect(r.state).toBe('none')
  })
  it('does not flag a small wobble around baseline, and is not_enough_data with under 3 days', () => {
    expect(driftOf(daily((d) => 78 + Math.sin(d)), { key: 'hr', baseline: 78, days: 7, now: NOW }).state).toBe('none')
    expect(driftOf(series(36, 30, () => 95), { key: 'hr', baseline: 78, days: 7, now: NOW }).state).toBe('not_enough_data')
  })
  it('one short spike inside a day does not make it drift (daily medians, not raw values)', () => {
    const pts = daily(() => 78)
    for (const p of pts.filter((x) => x.t > NOW - 2 * H)) p.v = 140
    expect(driftOf(pts, { key: 'hr', baseline: 78, days: 7, now: NOW }).state).toBe('none')
  })
})
