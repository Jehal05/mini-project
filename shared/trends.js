// Feature 92: trend statistics for the Digital Twin. Plain, explainable maths (least-squares slope, medians,
// a low percentile). No machine learning, nothing clinical. Used by the backend endpoint and its tests;
// every number is computed from SIMULATED readings.
//
// Points are { t: epoch milliseconds, v: number|null }. Null and non-numeric values are ignored, never zero.

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A change over the window smaller than this is "steady": below it, ordinary noise explains it. */
export const TREND_MIN_CHANGE = Object.freeze({ hr: 3, sys: 5, dia: 4, spo2: 1, temp: 0.3, rr: 2 })
/** How far a day's typical value must be from the patient's own baseline to count as drift. */
export const DRIFT_TOLERANCE = Object.freeze({ hr: 6, sys: 8, dia: 6, spo2: 1.5, temp: 0.4, rr: 3 })

const clean = (points) => (points ?? []).filter((p) => Number.isFinite(p?.t) && typeof p?.v === 'number' && Number.isFinite(p.v))
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** Least-squares slope in units per hour, or null when there is nothing to fit. */
export function slope(points) {
  const pts = clean(points)
  if (pts.length < 2) return null
  const t0 = pts[0].t
  const xs = pts.map((p) => (p.t - t0) / HOUR)
  const n = pts.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = pts.reduce((a, p) => a + p.v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (pts[i].v - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return { perHour: num / den, n }
}

const median = (vals) => {
  const s = [...vals].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const percentile = (vals, p) => {
  const s = [...vals].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

/**
 * Direction and rate of one vital over a window ending at `now`.
 * Returns { state: 'not_enough_data' } when there are too few points or they cover too little of the window.
 */
export function analyzeSeries(points, { key, windowHours, now = Date.now(), minPoints = 6, minCoverage = 0.5 } = {}) {
  const from = now - windowHours * HOUR
  const pts = clean(points)
    .filter((p) => p.t >= from && p.t <= now)
    .sort((a, b) => a.t - b.t)
  if (pts.length < minPoints) return { state: 'not_enough_data', reason: 'too_few_readings', n: pts.length }
  const spanHours = (pts.at(-1).t - pts[0].t) / HOUR
  if (spanHours < windowHours * minCoverage) return { state: 'not_enough_data', reason: 'too_little_time_covered', n: pts.length }
  const s = slope(pts)
  if (!s) return { state: 'not_enough_data', reason: 'no_slope', n: pts.length }
  const change = s.perHour * spanHours
  const min = TREND_MIN_CHANGE[key] ?? 0
  return {
    state: 'ok',
    direction: change >= min ? 'rising' : change <= -min ? 'falling' : 'steady',
    perHour: round(s.perHour, 3),
    change: round(change),
    mean: pts.reduce((a, p) => a + p.v, 0) / pts.length,
    latest: pts.at(-1).v,
    n: pts.length,
  }
}

/** Splits the last `days` days into rolling 24 h windows ending at `now`, oldest first. */
function dayWindows(points, days, now, minPerDay, reduce) {
  const pts = clean(points)
  const out = []
  for (let i = 0; i < days; i += 1) {
    const start = now - (days - i) * DAY
    const end = start + DAY
    const vals = pts.filter((p) => p.t > start && p.t <= end).map((p) => p.v)
    out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), value: vals.length >= minPerDay ? round(reduce(vals), 1) : null, n: vals.length, mid: start + DAY / 2 })
  }
  return out
}

function dayTrend(windows, key) {
  const usable = windows.filter((d) => d.value !== null)
  if (usable.length < 3) return { state: 'not_enough_data', usableDays: usable.length }
  const s = slope(usable.map((d) => ({ t: d.mid, v: d.value })))
  const perDay = s.perHour * 24
  const spanDays = (usable.at(-1).mid - usable[0].mid) / DAY
  const change = perDay * spanDays
  const min = TREND_MIN_CHANGE[key]
  return { state: 'ok', direction: change >= min ? 'rising' : change <= -min ? 'falling' : 'steady', perDay: round(perDay), change: round(change), usableDays: usable.length, spanDays, usable }
}

/**
 * Resting heart rate per day: the calm end of the day (10th percentile of the day's readings), so exercise or
 * a short spike does not move it. A day with too few readings is null.
 */
export function restingHr(points, { days = 7, now = Date.now(), minPerDay = 20 } = {}) {
  const windows = dayWindows(points, days, now, minPerDay, (v) => percentile(v, 0.1))
  const { usable, spanDays, ...trend } = dayTrend(windows, 'hr')
  return { ...trend, days: windows.map(({ mid, ...d }) => d) }
}

/**
 * Has this vital moved away from the patient's OWN baseline over several days and is it still moving that way?
 * Uses each day's median, so a short spike inside a day cannot cause it. Needs 3 days with data.
 */
export function driftOf(points, { key, baseline, days = 7, now = Date.now(), minPerDay = 20 } = {}) {
  const windows = dayWindows(points, days, now, minPerDay, median)
  const t = dayTrend(windows, key)
  if (t.state !== 'ok') return { state: 'not_enough_data', usableDays: t.usableDays }
  const latest = t.usable.at(-1).value
  const deviation = latest - baseline
  const tol = DRIFT_TOLERANCE[key]
  const away = Math.sign(deviation) !== 0 && Math.sign(deviation) === Math.sign(t.perDay)
  const moving = Math.abs(t.change) >= tol / 2
  const drifting = Math.abs(deviation) >= tol && away && moving
  return { state: drifting ? 'drifting' : 'none', ...(drifting && { direction: deviation > 0 ? 'up' : 'down' }), deviation: round(deviation, 1), perDay: t.perDay, latestDay: latest, baseline, usableDays: t.usableDays }
}
