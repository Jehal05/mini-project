// Features 37 and 93: a simple, explainable cardiac risk score.
//
// 0-100, from weighted rules: the patient's age and history (fixed) plus how far
// their current readings are from normal. Weights live in shared/detection.js and
// are editable through the detection config. The breakdown lists every point, so the
// score can always be explained. A demonstration, not a clinical tool.

import { DEFAULT_RISK_WEIGHTS, riskLevelFor, RISK_LEVELS } from '../../../shared/detection.js'
import { riskFactors } from '../simulation/baseline.js'

const hasCardiacFamily = (patient) => {
  const list = patient.familyHistory ?? patient.familyMedicalHistory ?? []
  if (!Array.isArray(list)) return false
  return list.some((x) => /heart|cardiac|stent|bypass|arrhythmia/i.test(typeof x === 'string' ? x : `${x?.condition ?? ''} ${x?.type ?? ''}`))
}

/** The part of the score that does not change tick to tick. */
export function staticRisk(patient, weights = DEFAULT_RISK_WEIGHTS) {
  const f = riskFactors(patient)
  const items = []
  const agePoints = Math.min(weights.ageMax, Math.max(0, (f.age - 30) * weights.agePerYearOver30))
  if (agePoints > 0) items.push({ factor: `Age ${f.age}`, points: round(agePoints) })
  if (f.cardiac) items.push({ factor: 'Previous cardiac condition', points: weights.cardiacHistory })
  if (f.hypertension) items.push({ factor: 'Hypertension', points: weights.hypertension })
  if (f.diabetes) items.push({ factor: 'Diabetes', points: weights.diabetes })
  if (hasCardiacFamily(patient)) items.push({ factor: 'Family cardiac history', points: weights.familyCardiacHistory })
  return items.filter((i) => i.points > 0) // a weight set to 0 switches the factor off
}

const round = (n) => Math.round(n * 10) / 10

/**
 * @param {object[]} fixed        staticRisk() output
 * @param {object} confirmed      vital -> confirmed status
 * @param {object} baselineConfirmed vital -> true
 * @param {number} level          current severity level (0-3)
 */
export function computeRisk(fixed, confirmed, baselineConfirmed, level, weights = DEFAULT_RISK_WEIGHTS) {
  const breakdown = [...fixed]
  for (const [vital, status] of Object.entries(confirmed)) {
    if (status === 'critical') breakdown.push({ factor: `${vital.toUpperCase()} critical`, points: weights.vitalCritical })
    else if (status === 'warning') breakdown.push({ factor: `${vital.toUpperCase()} warning`, points: weights.vitalWarning })
  }
  for (const [vital, far] of Object.entries(baselineConfirmed)) {
    if (far) breakdown.push({ factor: `${vital.toUpperCase()} far from own baseline`, points: weights.baselineShift })
  }
  const bonus = weights.levelBonus?.[level] ?? 0
  if (bonus) breakdown.push({ factor: `Severity level ${level}`, points: bonus })

  const score = Math.min(100, Math.round(breakdown.reduce((s, b) => s + b.points, 0)))
  const key = riskLevelFor(score, level)
  return { score, level: key, label: RISK_LEVELS[key].label, breakdown }
}
