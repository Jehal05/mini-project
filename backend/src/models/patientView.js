// How the monitoring, detection and emergency modules read a Patient.
//
// The real Patient model (identity and profile) names things patientId / fullName / medicalConditions.
// The monitoring code and its tests were written against hand-made records that say patientCode / name /
// conditions, so every read goes through these helpers and accepts both. Nothing here writes.

import { isBloodThinner } from '../services/patientSummary.js'

export const codeOf = (p) => p?.patientId ?? p?.patientCode
export const nameOf = (p) => p?.fullName ?? p?.name
export const conditionsOf = (p) => p?.conditions ?? p?.medicalConditions ?? p?.existingConditions

/** Query for "this id is either a Mongo _id or a readable code like HT-2026-0001". */
export const byCode = (code) => ({ patientId: String(code).toUpperCase() })


/**
 * The record that first aid (aspirin rule) and the contact alerts read, built from a real Patient.
 *
 * allergies and medications are `undefined` (unknown) unless the patient added something or confirmed that
 * the list is really empty; only then do they become arrays. First aid shows aspirin advice only for
 * known lists, so a patient who never filled the profile in is never told "aspirin is fine".
 */
export function toTwinRecord(patient) {
  if (!patient) return patient
  const known = (key) => patient.listsConfirmed?.[key] === true || (patient[key]?.length ?? 0) > 0
  const meds = patient.medications ?? []
  return {
    _id: patient._id,
    patientCode: codeOf(patient),
    name: nameOf(patient),
    dateOfBirth: patient.dateOfBirth,
    bloodGroup: patient.bloodGroup,
    city: patient.city,
    cardiacConditions: patient.cardiacConditions ?? [],
    conditions: (patient.medicalConditions ?? []).map((c) => c.name).filter(Boolean),
    allergies: known('allergies') ? patient.allergies.map((a) => a.allergen).filter(Boolean) : undefined,
    medications: known('medications') ? meds.map((m) => m.drug).filter(Boolean) : undefined,
    onBloodThinner: known('medications') ? meds.some((m) => isBloodThinner(m)) : undefined,
    emergencyContacts: [...(patient.emergencyContacts ?? [])].sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)).map((c) => ({ id: c._id ? String(c._id) : undefined, name: c.name, relation: c.relation, phone: c.phone, email: c.email })),
    fitnessLevel: patient.fitnessLevel,
  }
}
