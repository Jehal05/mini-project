// Feature 36: configurable detection settings. Validation and merging, no I/O.
//
// Three kinds of setting, all optional overrides over the shared defaults:
//   thresholds     per vital: normal [lo, hi] and critical { below, above, atOrAbove }
//   baselineLimits per vital: how far from the patient's own baseline counts as large (feature 35)
//   riskWeights    the weights of the risk score (feature 93)
// Admins edit the global overrides; a doctor can set per-patient threshold overrides.

import { DEFAULT_THRESHOLDS, VITAL_KEYS, mergeThresholds } from '../../../shared/vitals.js'
import { DEFAULT_BASELINE_LIMITS, DEFAULT_RISK_WEIGHTS } from '../../../shared/detection.js'

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const isPlainObject = (o) => o && typeof o === 'object' && !Array.isArray(o)

/** Returns { value, errors }. `value` holds only the cleaned overrides. */
export function validateThresholdOverrides(input, base = DEFAULT_THRESHOLDS) {
  const errors = []
  const value = {}
  if (input === undefined || input === null) return { value, errors }
  if (!isPlainObject(input)) return { value, errors: ['thresholds must be an object keyed by vital'] }

  for (const [key, o] of Object.entries(input)) {
    if (!VITAL_KEYS.includes(key)) {
      errors.push(`${key}: unknown vital (use ${VITAL_KEYS.join(', ')})`)
      continue
    }
    if (!isPlainObject(o)) {
      errors.push(`${key}: must be an object`)
      continue
    }
    const clean = {}
    const extra = Object.keys(o).filter((k) => !['normal', 'critical'].includes(k))
    if (extra.length) errors.push(`${key}: only normal and critical can be changed (got ${extra.join(', ')})`)

    if (o.normal !== undefined) {
      if (!Array.isArray(o.normal) || o.normal.length !== 2 || !o.normal.every(isNum) || !(o.normal[0] < o.normal[1])) {
        errors.push(`${key}.normal must be [low, high] numbers with low < high`)
      } else clean.normal = [o.normal[0], o.normal[1]]
    }
    if (o.critical !== undefined) {
      const c = o.critical
      const bad = !isPlainObject(c) || Object.keys(c).length === 0 || Object.entries(c).some(([k, v]) => !['below', 'above', 'atOrAbove'].includes(k) || !isNum(v))
      if (bad) errors.push(`${key}.critical must have numeric below, above and/or atOrAbove`)
      else clean.critical = { ...c }
    }

    // Cross-check against what the vital would look like after the change.
    if (!errors.some((e) => e.startsWith(`${key}.`) || e.startsWith(`${key}:`))) {
      const normal = clean.normal ?? base[key].normal
      const critical = clean.critical ?? base[key].critical
      if (critical.below !== undefined && critical.below > normal[0]) errors.push(`${key}: critical.below (${critical.below}) must not be above the normal low (${normal[0]})`)
      if (critical.above !== undefined && critical.above < normal[1]) errors.push(`${key}: critical.above (${critical.above}) must not be below the normal high (${normal[1]})`)
      if (critical.atOrAbove !== undefined && critical.atOrAbove <= normal[1]) errors.push(`${key}: critical.atOrAbove (${critical.atOrAbove}) must be above the normal high (${normal[1]})`)
      if (Object.keys(clean).length) value[key] = clean
    }
  }
  return { value: errors.length ? {} : value, errors }
}

export function validateBaselineLimits(input) {
  const errors = []
  const value = {}
  if (input === undefined || input === null) return { value, errors }
  if (!isPlainObject(input)) return { value, errors: ['baselineLimits must be an object keyed by vital'] }
  for (const [key, o] of Object.entries(input)) {
    if (!VITAL_KEYS.includes(key)) {
      errors.push(`${key}: unknown vital`)
      continue
    }
    const kinds = isPlainObject(o) ? Object.keys(o) : []
    if (kinds.length !== 1 || !['pct', 'drop', 'abs'].includes(kinds[0]) || !isNum(o[kinds[0]]) || o[kinds[0]] <= 0) {
      errors.push(`${key}: use exactly one of pct, drop or abs, as a number above 0`)
      continue
    }
    value[key] = { [kinds[0]]: o[kinds[0]] }
  }
  return { value: errors.length ? {} : value, errors }
}

export function validateRiskWeights(input) {
  const errors = []
  const value = {}
  if (input === undefined || input === null) return { value, errors }
  if (!isPlainObject(input)) return { value, errors: ['riskWeights must be an object'] }
  for (const [k, v] of Object.entries(input)) {
    if (!(k in DEFAULT_RISK_WEIGHTS)) errors.push(`${k}: unknown weight`)
    else if (k === 'levelBonus') {
      if (!isPlainObject(v) || Object.entries(v).some(([lvl, n]) => !['1', '2', '3'].includes(lvl) || !isNum(n) || n < 0)) errors.push('levelBonus must map 1, 2, 3 to numbers of 0 or more')
      else value.levelBonus = { ...DEFAULT_RISK_WEIGHTS.levelBonus, ...v }
    } else if (!isNum(v) || v < 0) errors.push(`${k} must be a number of 0 or more`)
    else value[k] = v
  }
  return { value: errors.length ? {} : value, errors }
}

/** Defaults + global overrides (+ optional per-patient overrides) -> what the engine uses. */
export function resolveConfig(stored = {}, patientOverrides) {
  const globalThresholds = mergeThresholds(stored.thresholds ?? {})
  return {
    thresholds: patientOverrides ? mergeThresholds(patientOverrides, globalThresholds) : globalThresholds,
    baselineLimits: { ...DEFAULT_BASELINE_LIMITS, ...(stored.baselineLimits ?? {}) },
    riskWeights: { ...DEFAULT_RISK_WEIGHTS, ...(stored.riskWeights ?? {}), levelBonus: { ...DEFAULT_RISK_WEIGHTS.levelBonus, ...(stored.riskWeights?.levelBonus ?? {}) } },
  }
}
