// Feature 99: backup and restore of the application data. Sign-in data (users, sessions, reset links) is never part of a
// file, so a backup cannot be used to take over an account. Restore checks the whole file before it replaces anything.

import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import {
  Admission, Ambulance, AuditLog, Bed, Counter, DischargeSummary, Doctor, EdBay, EmergencyCase, Hospital, HospitalCase, Patient, Prescription, VisitRecord,
} from '../models/index.js'

export const FORMAT = 'healthtwin-backup'
export const VERSION = 1
/** What is saved. `restore: false` collections are exported for reading but never overwritten (audit logs must not be editable). */
export const COLLECTIONS = [
  ['hospitals', Hospital], ['doctors', Doctor], ['beds', Bed], ['edbays', EdBay], ['ambulances', Ambulance], ['patients', Patient],
  ['emergencycases', EmergencyCase], ['hospitalcases', HospitalCase], ['admissions', Admission], ['visitrecords', VisitRecord],
  ['prescriptions', Prescription], ['dischargesummaries', DischargeSummary], ['counters', Counter],
]
const READ_ONLY = [['auditlogs', AuditLog]]
const SECRET_FIELDS = ['qrToken', 'passwordHash']
const strip = (doc) => { const o = { ...doc }; for (const f of SECRET_FIELDS) delete o[f]; return o }
const fail = (status, message) => Object.assign(new Error(message), { status })

/** The whole backup as a plain object. */
export async function createBackup({ now = new Date() } = {}) {
  const data = {}
  for (const [name, Model] of [...COLLECTIONS, ...READ_ONLY]) data[name] = (await Model.find({}).lean()).map(strip)
  return { format: FORMAT, version: VERSION, createdAt: now.toISOString(), counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])), data }
}

/**
 * Checks a backup file without changing anything. Returns { ok, problems[] }. Every document is cast through its schema
 * (so a wrong type or a missing required field is caught) and ids must be unique inside a collection.
 */
export async function validateBackup(file) {
  const problems = []
  if (!file || typeof file !== 'object' || file.format !== FORMAT) return { ok: false, problems: ['This is not a HealthTwin backup file'] }
  if (file.version !== VERSION) return { ok: false, problems: [`Unsupported backup version ${file.version}`] }
  if (!file.data || typeof file.data !== 'object') return { ok: false, problems: ['The backup has no data'] }
  for (const [name, Model] of COLLECTIONS) {
    const docs = file.data[name]
    if (docs === undefined) continue
    if (!Array.isArray(docs)) { problems.push(`${name}: expected a list`); continue }
    if (file.counts && file.counts[name] !== undefined && file.counts[name] !== docs.length) problems.push(`${name}: the file says ${file.counts[name]} records but holds ${docs.length}`)
    const seen = new Set()
    for (const [i, d] of docs.entries()) {
      const id = String(d?._id ?? '')
      if (!id) { problems.push(`${name}[${i}]: no _id`); continue }
      if (seen.has(id)) problems.push(`${name}[${i}]: duplicate _id ${id}`)
      seen.add(id)
      try { await new Model(d).validate() } catch (err) { problems.push(`${name}[${i}]: ${Object.values(err.errors ?? { e: err }).map((e) => e.message).slice(0, 2).join('; ')}`) }
      if (problems.length >= 20) return { ok: false, problems: [...problems, 'More problems follow'] }
    }
  }
  return { ok: problems.length === 0, problems }
}

/** Replaces the data collections with the file's, after validation. Restores all or nothing where the database supports transactions. */
export async function restoreBackup(file) {
  const check = await validateBackup(file)
  if (!check.ok) throw Object.assign(fail(400, 'The backup file failed its checks. Nothing was changed.'), { details: check.problems })
  const present = COLLECTIONS.filter(([name]) => Array.isArray(file.data[name]))
  const apply = async (session) => {
    for (const [name, Model] of present) {
      await Model.deleteMany({}, { session })
      if (file.data[name].length) await Model.collection.insertMany(file.data[name].map((d) => hydrate(Model, d)), { session })
    }
  }
  const session = await mongoose.startSession()
  try {
    try { await session.withTransaction(() => apply(session)) } catch (err) {
      if (!/Transaction numbers are only allowed|replica set|retryable writes/i.test(err.message)) throw err
      await apply(undefined) // a single-node development database has no transactions
    }
  } finally { await session.endSession() }
  return Object.fromEntries(present.map(([name]) => [name, file.data[name].length]))
}

// JSON turns ObjectIds and dates into strings. Cast them back through the schema so the stored types match.
function hydrate(Model, d) { return new Model(d).toObject({ depopulate: true, virtuals: false, versionKey: true }) }

/** Scheduled dumps: one JSON file a day in `dir`, the newest `keep` kept. */
export function startScheduledBackups({ dir, everyMs = 24 * 3_600_000, keep = 7, logger = console } = {}) {
  if (!dir) return { stop() {} }
  const run = async () => {
    try {
      await fs.mkdir(dir, { recursive: true })
      const file = path.join(dir, `healthtwin-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      await fs.writeFile(file, JSON.stringify(await createBackup()))
      const files = (await fs.readdir(dir)).filter((f) => /^healthtwin-.*\.json$/.test(f)).sort()
      for (const old of files.slice(0, Math.max(0, files.length - keep))) await fs.rm(path.join(dir, old)).catch(() => {})
      logger.log?.(`[backup] wrote ${path.basename(file)}`)
    } catch (err) { logger.error?.('[backup] failed', err.message) }
  }
  const timer = setInterval(run, everyMs)
  timer.unref?.()
  return { stop: () => clearInterval(timer), runNow: run }
}
