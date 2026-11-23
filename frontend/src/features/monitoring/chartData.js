// Pure helpers for the history chart and timeline (easy to unit test).
import { DEFAULT_THRESHOLDS } from '@shared/vitals.js'

export const RANGES = [
  { key: '1h', label: 'Last hour', live: true },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
]

/** Chart tabs. BP shows systolic and diastolic together. */
export const CHART_VITALS = [
  { key: 'hr', label: 'Heart rate', lines: ['hr'] },
  { key: 'bp', label: 'Blood pressure', lines: ['sys', 'dia'] },
  { key: 'spo2', label: 'SpO2', lines: ['spo2'] },
  { key: 'temp', label: 'Temperature', lines: ['temp'] },
  { key: 'rr', label: 'Respiratory rate', lines: ['rr'] },
]

const HOUR = 3600_000

/** Append a live update to 1-hour data, keeping one hour and at most one point per tick. */
export function mergeLive(points, update, windowMs = HOUR) {
  if (!update) return points
  const at = update.at
  if (points.length && points[points.length - 1].at >= at) return points
  const next = [...points, { at, ...update.vitals, status: update.status }]
  const cutoff = Date.parse(at) - windowMs
  let start = 0
  while (start < next.length && Date.parse(next[start].at) < cutoff) start += 1
  return start ? next.slice(start) : next
}

/** Threshold guides for a chart tab: the normal band and the critical bounds of its first line. */
export function thresholdGuides(vitalKey, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds[vitalKey]
  if (!t) return null
  const critical = [t.critical.below, t.critical.above ?? t.critical.atOrAbove].filter((v) => v !== undefined)
  return { normal: t.normal, critical, unit: t.unit }
}

/** Y-axis domain that always shows the normal band and the data. */
export function yDomain(points, lines, guides) {
  const values = points.flatMap((p) => lines.map((k) => p[k])).filter((v) => typeof v === 'number')
  const lo = Math.min(...values, guides?.normal?.[0] ?? Infinity, ...(guides?.critical ?? []))
  const hi = Math.max(...values, guides?.normal?.[1] ?? -Infinity, ...(guides?.critical ?? []))
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return ['auto', 'auto']
  const pad = (hi - lo) * 0.08 || 1
  const decimals = lines.includes('temp') ? 1 : 0
  const r = (v) => Number(v.toFixed(decimals))
  return [r(lo - pad), r(hi + pad)]
}

/** Time label for the x-axis. */
export function formatTick(value, range) {
  const d = new Date(value)
  if (range === '7d') return d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Feature 30: turn readings into coloured status segments for the timeline bar.
 * Consecutive readings with the same status merge into one segment.
 */
export function statusSegments(readings, from, to) {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const span = end - start || 1
  const segs = []
  readings.forEach((r, i) => {
    const t0 = Date.parse(r.at)
    const t1 = i + 1 < readings.length ? Date.parse(readings[i + 1].at) : end
    const last = segs[segs.length - 1]
    if (last && last.status === r.status && Math.abs(last.t1 - t0) < 1) {
      last.t1 = t1
    } else {
      segs.push({ status: r.status, t0, t1 })
    }
  })
  return segs.map((s) => ({
    status: s.status,
    from: new Date(s.t0).toISOString(),
    to: new Date(s.t1).toISOString(),
    left: ((s.t0 - start) / span) * 100,
    width: Math.max(0.15, ((s.t1 - s.t0) / span) * 100),
  }))
}

export function positionPct(iso, from, to) {
  const start = Date.parse(from)
  const span = Date.parse(to) - start || 1
  return Math.min(100, Math.max(0, ((Date.parse(iso) - start) / span) * 100))
}
