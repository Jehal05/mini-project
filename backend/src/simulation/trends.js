// Feature 92: trends from the stored (simulated) history. The maths is in shared/trends.js.
import { VITAL_KEYS } from '../../../shared/vitals.js'
import { analyzeSeries, restingHr, driftOf } from '../../../shared/trends.js'
import { vitalsHistory } from './history.js'
import { computeBaseline } from './baseline.js'

const toPoints = (rows, key) => rows.map((r) => ({ t: Date.parse(r.at), v: r[key] }))

export async function patientTrends(patient, { now = new Date(), thresholds } = {}) {
  const [day, week] = await Promise.all([
    vitalsHistory(patient._id, '24h', { now, thresholds }), // 5-minute averages
    vitalsHistory(patient._id, '7d', { now, thresholds }), // 30-minute averages
  ])
  const baseline = computeBaseline(patient)
  const at = now.getTime()
  const per = (rows, windowHours) => Object.fromEntries(VITAL_KEYS.map((k) => [k, analyzeSeries(toPoints(rows, k), { key: k, windowHours, now: at })]))
  return {
    simulated: true,
    generatedAt: now.toISOString(),
    baseline,
    last24h: per(day, 24),
    last7d: per(week, 24 * 7),
    restingHr: restingHr(toPoints(week, 'hr'), { days: 7, now: at }),
    drift: Object.fromEntries(VITAL_KEYS.map((k) => [k, driftOf(toPoints(week, k), { key: k, baseline: baseline[k], days: 7, now: at })])),
  }
}
