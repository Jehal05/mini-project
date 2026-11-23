// Features 91 and 101: what the Digital Twin says. Plain comparison with the patient's OWN baseline.
// Everything is simulated. The wording describes patterns ("compared with your usual"); it never diagnoses.
import { VITAL_KEYS, formatVital, TREND_MIN_CHANGE } from './constants.js'

export const VITAL_LABEL = { hr: 'Heart rate', sys: 'Systolic BP', dia: 'Diastolic BP', spo2: 'SpO2', temp: 'Temperature', rr: 'Breathing rate' }
export const VITAL_UNIT = { hr: 'BPM', sys: 'mmHg', dia: 'mmHg', spo2: '%', temp: '°C', rr: '/min' }
// SpO2 and temperature are compared in plain units; the others as a percentage of the patient's own baseline.

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const trim = (n, d) => Number(n.toFixed(d))
const withUnit = (key, v) => `${formatVital(key, v)} ${VITAL_UNIT[key]}`

export function compareVital(key, now, baseline) {
  const label = VITAL_LABEL[key]
  if (!isNum(now) || !isNum(baseline) || baseline === 0) {
    return { key, label, now: isNum(now) ? now : null, baseline: isNum(baseline) ? baseline : null, relation: 'no_data', size: 0, text: `${label}: not enough data yet.` }
  }
  const delta = now - baseline
  const size = Math.abs(delta) / (TREND_MIN_CHANGE[key] ?? 1)
  const usual = Math.abs(delta) < (TREND_MIN_CHANGE[key] ?? 0)
  const base = { key, label, now, baseline, delta, size }
  if (usual) return { ...base, relation: 'usual', text: `${label} is in line with your usual (${withUnit(key, baseline)}).` }
  const relation = delta > 0 ? 'above' : 'below'
  let amount
  if (key === 'spo2') {
    const pts = Math.round(Math.abs(delta))
    amount = `${pts} ${pts === 1 ? 'point' : 'points'}`
  } else if (key === 'temp') amount = `${trim(Math.abs(delta), 1)} °C`
  else amount = `${Math.round((Math.abs(delta) / baseline) * 100)}%`
  return { ...base, relation, pct: (delta / baseline) * 100, text: `${label} is ${amount} ${relation} your usual (${withUnit(key, baseline)}).` }
}

/** Rows for all six vitals. `live` is the vitals:update payload (with `.vitals`) or null. */
export function compareAll(live, baseline) {
  return VITAL_KEYS.map((k) => compareVital(k, live?.vitals?.[k], baseline?.[k]))
}

export function twinSummary(rows, detection) {
  const have = rows.filter((r) => r.relation !== 'no_data')
  const differing = have.filter((r) => r.relation !== 'usual').sort((a, b) => b.size - a.size)
  let headline
  if (have.length === 0) headline = rows.some((r) => r.now !== null) ? 'Your usual readings are not available yet.' : 'Waiting for live readings.'
  else if (differing.length === 0) headline = 'All your readings are in line with your usual.'
  else headline = `${differing.length} of your readings ${differing.length === 1 ? 'differs' : 'differ'} from your usual.`
  let detectionText
  if (!detection) detectionText = 'Detection status is not available yet.'
  else if (!detection.level) detectionText = 'Detection sees no abnormal pattern.'
  else detectionText = `Detection sees a Level ${detection.level} pattern${(detection.primary?.message ?? detection.rules?.[0]?.message) ? `: ${detection.primary?.message ?? detection.rules[0].message}` : '.'}`
  return { headline, lines: differing.slice(0, 3).map((r) => r.text), detection: detectionText }
}

const sign = (n) => (n > 0 ? '+' : n < 0 ? '-' : '')
const amount = (key, n) => (key === 'temp' ? trim(Math.abs(n), 1) : Math.round(Math.abs(n)))

/** "rising, about +12 BPM over the day" / "steady" / "not enough data yet". windowWord: 'day' or 'week'. */
export function trendText(a, key, windowWord) {
  if (!a || a.state !== 'ok') return 'not enough data yet'
  if (a.direction === 'steady') return 'steady'
  return `${a.direction}, about ${sign(a.change)}${amount(key, a.change)} ${VITAL_UNIT[key]} over the ${windowWord}`
}

export function driftText(d, key) {
  if (d?.state !== 'drifting') return null
  return `${VITAL_LABEL[key]} has drifted ${d.direction} from your usual over several days.`
}

export function restingText(r) {
  if (r?.state !== 'ok') return 'Resting heart rate: not enough data yet (needs 3 days).'
  if (r.direction === 'steady') return 'Resting heart rate is steady.'
  return `Resting heart rate is ${r.direction}, about ${sign(r.perDay)}${trim(Math.abs(r.perDay), 1)} BPM per day.`
}
