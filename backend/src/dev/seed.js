// Fictional demo patients (team rule 4: no real patient data) and optional
// backfilled history so the 24 h and 7 d graphs are not empty on a new database.

import bcrypt from 'bcryptjs'
import { config } from '../config/env.js'
import { Counter } from '../models/Counter.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { randomToken } from '../utils/crypto.js'
import { DEMO_PASSWORD } from '../seed/seed.js'
import { VitalReading } from '../models/VitalReading.js'
import { HealthEvent } from '../models/HealthEvent.js'
import { computeBaseline } from '../simulation/baseline.js'
import { generateHistory, seededRng } from '../simulation/engine.js'
import { readingStatuses, worstStatus } from '../../../shared/vitals.js'

const yearsAgo = (y, monthDay = '06-15') => new Date(`${new Date().getFullYear() - y}-${monthDay}T00:00:00Z`)

export const DEMO_PATIENTS = [
  {
    patientCode: 'HT-2026-0001',
    email: 'rahul.sharma@example.com',
    name: 'Rahul Sharma',
    dateOfBirth: yearsAgo(45, '03-12'),
    gender: 'male',
    bloodGroup: 'B+',
    city: 'Pune',
    cardiacConditions: [{ type: 'heart_attack', year: 2022 }],
    conditions: [],
    emergencyContacts: [{ name: 'Meera Sharma', relation: 'spouse', phone: '+919800000001', email: 'meera.demo@example.com', priority: 1 }],
  },
  {
    patientCode: 'HT-2026-0002',
    email: 'ananya.iyer@example.com',
    name: 'Ananya Iyer',
    dateOfBirth: yearsAgo(25, '01-20'),
    gender: 'female',
    bloodGroup: 'O+',
    city: 'Pune',
    cardiacConditions: [],
    conditions: [],
    fitnessLevel: 'high',
    knownNone: ['allergies', 'medications'], // confirmed: no allergies and no medicines, so the aspirin step can be shown in the demo
    emergencyContacts: [{ name: 'Lakshmi Iyer', relation: 'mother', phone: '+919800000002', priority: 1 }],
  },
  {
    patientCode: 'HT-2026-0003',
    email: 'vikram.desai@example.com',
    name: 'Vikram Desai',
    dateOfBirth: yearsAgo(61, '02-02'),
    gender: 'male',
    bloodGroup: 'A-',
    city: 'Pune',
    cardiacConditions: [],
    conditions: ['hypertension', 'diabetes'],
  },
]

/**
 * Create the three demo patients with real accounts (password printed by `npm run seed`).
 * Safe to run many times: a patient who already exists is left exactly as it is.
 */
export async function seedPatients() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds)
  const out = []
  for (const p of DEMO_PATIENTS) {
    let patient = await Patient.findOne({ patientId: p.patientCode }).lean()
    if (!patient) {
      const user = (await User.findOne({ email: p.email })) ?? (await User.create({ name: p.name, email: p.email, role: 'patient', passwordHash }))
      patient = (
        await Patient.create({
          patientId: p.patientCode,
          user: user._id,
          fullName: p.name,
          dateOfBirth: p.dateOfBirth,
          gender: p.gender,
          bloodGroup: p.bloodGroup,
          city: p.city,
          cardiacConditions: p.cardiacConditions,
          medicalConditions: p.conditions.map((name) => ({ name })),
          emergencyContacts: p.emergencyContacts ?? [],
          fitnessLevel: p.fitnessLevel,
          listsConfirmed: Object.fromEntries((p.knownNone ?? []).map((k) => [k, true])),
          consent: { dataUse: true, location: true },
          qrToken: randomToken(32),
        })
      ).toObject()
    }
    out.push({ ...patient, patientCode: patient.patientId, name: patient.fullName }) // the monitoring tests look patients up by these names
  }
  await Counter.updateOne({ _id: `patientId:${new Date().getFullYear()}` }, { $max: { seq: DEMO_PATIENTS.length } }, { upsert: true })
  return out
}

/**
 * Fill the last 7 days with simulated readings for any patient that has none:
 * one per 5 minutes up to an hour ago, then one per 30 s for the last hour.
 */
export async function backfillHistory(patients, { now = Date.now(), seed = 7 } = {}) {
  let total = 0
  for (const [i, p] of patients.entries()) {
    if (await VitalReading.exists({ patient: p._id })) continue
    const baseline = computeBaseline(p)
    const rng = seededRng(seed + i)
    const older = generateHistory({ baseline, from: now - 7 * 24 * 3600_000, to: now - 3600_000 - 30_000, stepMs: 5 * 60_000, rng })
    const recent = generateHistory({ baseline, from: now - 3600_000, to: now - 30_000, stepMs: 30_000, rng })
    const docs = [...older, ...recent].map((r) => ({
      patient: p._id,
      recordedAt: r.recordedAt,
      ...r.vitals,
      scenario: r.scenario,
      statuses: readingStatuses(r.vitals),
      status: worstStatus(r.vitals),
    }))
    await VitalReading.insertMany(docs, { ordered: false })
    await HealthEvent.create({
      patient: p._id,
      type: 'monitoring_started',
      at: new Date(now - 7 * 24 * 3600_000),
      message: 'Simulated monitoring started (backfilled demo history)',
      severity: 'info',
      data: { baseline, backfilled: true },
    })
    total += docs.length
  }
  return total
}
