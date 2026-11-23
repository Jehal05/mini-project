// HealthTwin AI: shared detection constants (Daksh, Phase 6).
//
// Everything the detection engine, the Patient Portal gauge, the Hospital Portal
// and the admin threshold page need to agree on, besides the vital thresholds in
// vitals.js and the severity levels in emergency.js. Demo values, not clinical criteria.

/** Features 31-33: a vital must be abnormal this many ticks in a row before it counts. */
export const PERSISTENCE_TICKS = 3

/** Ticks a LOWER level must hold before the displayed level steps down (stops flapping). */
export const DEESCALATION_TICKS = 3

/**
 * Feature 35: how far a vital may move from the patient's own baseline before it is
 * flagged, even when it is still inside the general normal range.
 *   pct  - percentage change, up or down
 *   drop - absolute fall only (SpO2 points)
 *   abs  - absolute change, up or down
 */
export const DEFAULT_BASELINE_LIMITS = Object.freeze({
  hr: { pct: 40 }, // plan: "heart rate up 40%"
  sys: { pct: 25 },
  dia: { pct: 25 },
  spo2: { drop: 6 },
  temp: { abs: 1.2 },
  rr: { pct: 60 },
})

/** Feature 37/93: risk score weights (editable). Points are added, then capped at 100. */
export const DEFAULT_RISK_WEIGHTS = Object.freeze({
  agePerYearOver30: 0.35, // capped by ageMax
  ageMax: 15,
  cardiacHistory: 20,
  hypertension: 10,
  diabetes: 8,
  familyCardiacHistory: 8,
  vitalWarning: 6, // per vital currently in Warning (persisted)
  vitalCritical: 15, // per vital currently in Critical (persisted)
  baselineShift: 8, // per vital far from the patient's baseline
  levelBonus: { 1: 0, 2: 5, 3: 20 }, // added for the current severity level
})

/** Feature 37: gauge bands. A Level 3 detection is always High; Level 2 is at least Moderate. */
export const RISK_LEVELS = Object.freeze({
  low: { key: 'low', label: 'Low', min: 0 },
  moderate: { key: 'moderate', label: 'Moderate', min: 35 },
  high: { key: 'high', label: 'High', min: 65 },
})

export function riskLevelFor(score, severityLevel = 0) {
  let key = score >= RISK_LEVELS.high.min ? 'high' : score >= RISK_LEVELS.moderate.min ? 'moderate' : 'low'
  if (severityLevel >= 3) key = 'high'
  else if (severityLevel === 2 && key === 'low') key = 'moderate'
  return key
}

/** Feature 40: what happened to a detection. Phase 7 moves 'case_created' on to the rest. */
export const DETECTION_OUTCOME = Object.freeze({
  PENDING: 'pending', // still open
  RESOLVED: 'resolved', // readings returned to normal without a case
  CASE_CREATED: 'case_created', // Level 3: an EmergencyCase exists
  SENT: 'sent', // case went to hospitals (Phase 7)
  CANCELLED: 'cancelled', // patient cancelled (Phase 7)
  FALSE_ALARM: 'false_alarm', // cancelled as a false alarm (Phase 7)
})

/** Socket.IO events the detection engine emits to the room `patient:<id>`. */
export const DETECTION_EVENTS = Object.freeze({
  UPDATE: 'detection:update', // level, rules or risk changed
  CLEARED: 'detection:cleared', // readings back to normal
  CASE_CREATED: 'emergency:created', // Level 3 opened an EmergencyCase
})

/** Direction of an abnormal value, used by the rule table. */
export function vitalDirection(key, value, thresholds) {
  const t = thresholds[key]
  if (!t || value === null || value === undefined || Number.isNaN(value)) return null
  if (value < t.normal[0]) return 'low'
  if (value > t.normal[1]) return 'high'
  return null
}
