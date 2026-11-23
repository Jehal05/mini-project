// HealthTwin AI: shared vital-sign thresholds (Daksh, Phase 1 contract).
//
// One source of truth for the backend detection engine, the Patient Portal,
// the Hospital Portal and the Central Admin Portal. Values are the DEMO
// thresholds from the feature plan. They are configurable and are NOT
// clinical criteria.
//
// How a reading is classified:
//   - inside `normal`                      -> 'normal'
//   - beyond a `critical` bound            -> 'critical'
//   - anything else (between the two)      -> 'warning'
// Classifying "outside normal but not critical" as warning closes the gaps
// in the plan's table (temperature 35.0-36.0 °C, respiratory rate 10-11/min),
// so every value always gets exactly one status.
//
// Critical bounds use explicit comparators so the plan's wording is exact:
//   below:     value <  below
//   above:     value >  above
//   atOrAbove: value >= atOrAbove

export const SIMULATED_LABEL = 'Simulated data for demonstration. Not a medical device.'

export const STATUS = Object.freeze({ NORMAL: 'normal', WARNING: 'warning', CRITICAL: 'critical' })

const RANK = { normal: 0, warning: 1, critical: 2 }

export const VITAL_KEYS = Object.freeze(['hr', 'sys', 'dia', 'spo2', 'temp', 'rr'])

export const DEFAULT_THRESHOLDS = Object.freeze({
  // Plan: Normal 60-100, Warning 50-59 or 101-120, Critical below 50 or above 120
  hr: { label: 'Heart rate', unit: 'BPM', decimals: 0, normal: [60, 100], critical: { below: 50, above: 120 } },
  // Plan: Normal 90-139, Warning 140-179, Critical below 90 or 180+
  sys: { label: 'Systolic BP', unit: 'mmHg', decimals: 0, normal: [90, 139], critical: { below: 90, atOrAbove: 180 } },
  // Not in the plan's table (feature 32 mentions diastolic). Proposed demo values; agree with the team.
  dia: { label: 'Diastolic BP', unit: 'mmHg', decimals: 0, normal: [60, 89], critical: { below: 50, atOrAbove: 120 } },
  // Plan: Normal 95-100, Warning 90-94, Critical below 90
  spo2: { label: 'SpO2', unit: '%', decimals: 0, normal: [95, 100], critical: { below: 90 } },
  // Plan: Normal 36.1-37.5, Warning 37.6-38.9, Critical below 35 or 39+
  temp: { label: 'Temperature', unit: '°C', decimals: 1, normal: [36.1, 37.5], critical: { below: 35, atOrAbove: 39 } },
  // Plan: Normal 12-20, Warning 21-24, Critical below 10 or above 24
  rr: { label: 'Respiratory rate', unit: '/min', decimals: 0, normal: [12, 20], critical: { below: 10, above: 24 } },
})

function isCritical(value, critical) {
  if (critical.below !== undefined && value < critical.below) return true
  if (critical.above !== undefined && value > critical.above) return true
  if (critical.atOrAbove !== undefined && value >= critical.atOrAbove) return true
  return false
}

/** Status of one vital. Unknown keys and missing values count as normal. */
export function vitalStatus(key, value, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds[key]
  if (!t || value === null || value === undefined || Number.isNaN(value)) return STATUS.NORMAL
  if (isCritical(value, t.critical)) return STATUS.CRITICAL
  if (value < t.normal[0] || value > t.normal[1]) return STATUS.WARNING
  return STATUS.NORMAL
}

/** Status of every vital in a reading, e.g. { hr: 'critical', spo2: 'warning', ... }. */
export function readingStatuses(reading, thresholds = DEFAULT_THRESHOLDS) {
  const out = {}
  for (const key of VITAL_KEYS) {
    if (reading[key] !== undefined && reading[key] !== null) out[key] = vitalStatus(key, reading[key], thresholds)
  }
  return out
}

/** Feature 29: the patient takes the worst status of their vitals. */
export function worstStatus(reading, thresholds = DEFAULT_THRESHOLDS) {
  let worst = STATUS.NORMAL
  for (const s of Object.values(readingStatuses(reading, thresholds))) {
    if (RANK[s] > RANK[worst]) worst = s
  }
  return worst
}

export function formatVital(key, value, thresholds = DEFAULT_THRESHOLDS) {
  if (value === null || value === undefined) return '--'
  const decimals = thresholds[key]?.decimals ?? 0
  return Number(value).toFixed(decimals)
}

/** Merge admin-edited thresholds (feature 36) over the defaults, per vital. */
export function mergeThresholds(overrides = {}, base = DEFAULT_THRESHOLDS) {
  const out = {}
  for (const key of Object.keys(base)) {
    const o = overrides[key] || {}
    out[key] = {
      ...base[key],
      ...o,
      normal: o.normal || base[key].normal,
      critical: o.critical ? { ...o.critical } : base[key].critical,
    }
  }
  return out
}
