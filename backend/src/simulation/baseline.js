// Feature 27: per-patient baselines from age and conditions.
//
// These are simple, explainable demo rules, not clinical models. They put each
// patient's "stable" vitals in a believable place so patients look different:
// Rahul (45, previous cardiac condition) starts near 78 BPM; a fit 25-year-old
// starts in the mid 60s.

import { conditionsOf } from '../models/patientView.js'

/** Age in whole years from a date of birth, or the age field if present. */
export function ageOf(patient, now = new Date()) {
  if (typeof patient.age === 'number') return patient.age
  if (!patient.dateOfBirth) return 40
  const dob = new Date(patient.dateOfBirth)
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1
  return age
}

// Items may be plain strings or objects; Jehal's schema may call the text field type, name or condition.

const lc = (list = []) =>
  (Array.isArray(list) ? list : []).map((x) => String(typeof x === 'string' ? x : x?.type ?? x?.name ?? x?.condition ?? '').toLowerCase())

/** Reads the medical fields we need, tolerating small naming differences in Jehal's Patient schema. */
export function riskFactors(patient) {
  const conditions = lc(conditionsOf(patient))
  const cardiac = lc(patient.cardiacConditions ?? patient.cardiacHistory)
  return {
    age: ageOf(patient),
    cardiac: cardiac.length > 0,
    hypertension: conditions.some((c) => c.includes('hypertension')),
    diabetes: conditions.some((c) => c.includes('diabetes')),
    asthma: conditions.some((c) => c.includes('asthma')),
    fit: Boolean(patient.fitnessLevel === 'high' || patient.athletic),
  }
}

const round1 = (n) => Math.round(n * 10) / 10

/** Stable-state vitals for a patient. */
export function computeBaseline(patient) {
  const f = riskFactors(patient)
  const ageOver25 = Math.max(0, f.age - 25)

  // Every baseline stays inside the Normal band with room for drift, so the
  // Stable scenario always reads Normal and the cardiac scenario stands out.
  let hr = 67 + ageOver25 * 0.15
  if (f.cardiac) hr += 8
  if (f.diabetes) hr += 3
  if (f.fit) hr -= 1

  let sys = 112 + ageOver25 * 0.4
  if (f.hypertension) sys += 4 // treated hypertension: high-normal, not Warning
  if (f.cardiac) sys += 4

  let dia = 72 + ageOver25 * 0.15
  if (f.hypertension) dia += 3

  let spo2 = 98.4 - ageOver25 * 0.02
  if (f.asthma) spo2 -= 0.8
  if (f.cardiac) spo2 -= 0.3

  const temp = 36.8
  let rr = 15 + ageOver25 * 0.03
  if (f.asthma) rr += 1.5

  return {
    hr: round1(hr),
    sys: round1(sys),
    dia: round1(dia),
    spo2: round1(Math.min(99.5, spo2)),
    temp: round1(temp),
    rr: round1(rr),
  }
}
