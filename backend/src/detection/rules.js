// Features 31-35, 38: the detection rule table.
//
// Rules are DATA, not code, so the table is easy to read and extend. Each rule says
// which severity level it produces and what has to be true. All numbers come from
// shared/vitals.js (thresholds) and shared/detection.js (baseline limits): a rule
// only says "heart rate Critical and high", never "heart rate > 120".
//
// Rule types
//   multi     every condition must hold (feature 34). Level 3 cardiac patterns.
//   vital     one vital at least this status (features 31-33). Level 2 Critical, Level 1 Warning.
//   baseline  one vital far from the patient's own baseline (feature 35). Level 2.
//
// A condition is { vital, min: 'warning' | 'critical', dir: 'high' | 'low' }, and it is
// met when the vital's CONFIRMED status (3 ticks in a row) is at least `min` in that direction.
//
// Precedence: higher level first; at the same level the rule with more conditions
// (the more specific one) first; then table order. The first rule that fires is the
// "primary" rule shown to the patient and stored on the case.

import { VITAL_KEYS } from '../../../shared/vitals.js'

const cond = (vital, min, dir) => ({ vital, min, dir })

/** Level 3: multi-parameter cardiac patterns (feature 34). */
export const MULTI_RULES = Object.freeze([
  {
    id: 'multi:tachycardia-hypoxia',
    type: 'multi',
    level: 3,
    label: 'Very fast heart rate with low oxygen',
    all: [cond('hr', 'critical', 'high'), cond('spo2', 'critical', 'low')],
  },
  {
    id: 'multi:shock-pattern',
    type: 'multi',
    level: 3,
    label: 'Fast pulse, critically low blood pressure and low oxygen',
    all: [cond('hr', 'warning', 'high'), cond('sys', 'critical', 'low'), cond('spo2', 'warning', 'low')],
  },
  {
    id: 'multi:bradycardia-hypotension',
    type: 'multi',
    level: 3,
    label: 'Very slow heart rate with critically low blood pressure',
    all: [cond('hr', 'critical', 'low'), cond('sys', 'critical', 'low')],
  },
  {
    id: 'multi:tachycardia-hypertension-breathless',
    type: 'multi',
    level: 3,
    label: 'Very fast heart rate, high blood pressure and fast breathing',
    all: [cond('hr', 'critical', 'high'), cond('sys', 'warning', 'high'), cond('rr', 'warning', 'high')],
  },
])

/** Level 2: one vital Critical (features 31-33). */
export const CRITICAL_RULES = Object.freeze(
  VITAL_KEYS.map((vital) => ({ id: `critical:${vital}`, type: 'vital', level: 2, vital, min: 'critical' })),
)

/** Level 2: a large change from the patient's own baseline (feature 35). */
export const BASELINE_RULES = Object.freeze(
  VITAL_KEYS.map((vital) => ({ id: `baseline:${vital}`, type: 'baseline', level: 2, vital })),
)

/** Level 1: one vital in Warning (features 31-33). */
export const WARNING_RULES = Object.freeze(
  VITAL_KEYS.map((vital) => ({ id: `warning:${vital}`, type: 'vital', level: 1, vital, min: 'warning' })),
)

export const RULES = Object.freeze([...MULTI_RULES, ...CRITICAL_RULES, ...BASELINE_RULES, ...WARNING_RULES])

/** A plain description of the table for the API and docs. */
export function describeRules() {
  return RULES.map((r) => ({
    id: r.id,
    type: r.type,
    level: r.level,
    label: r.label ?? null,
    conditions: r.all ?? (r.type === 'vital' ? [{ vital: r.vital, min: r.min }] : [{ vital: r.vital, baselineChange: true }]),
  }))
}
