// Who may see and change what in the monitoring, detection and emergency modules.
// This replaces the presenter key and the "allow all sockets" placeholders in simulation/access.js.
//
//   patient          their own data only (the patient id comes from the token, never from the request)
//   doctor / staff   a patient who is on a case their hospital accepted, or is admitted there
//   central_admin    everything (and the presenter controls and detection settings)
//   family link      public status page by token; it never reaches these checks
//
// A request for a patient you may not see gets the same answer as a patient that does not exist.

import mongoose from 'mongoose'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { Admission } from '../models/Admission.js'
import { HospitalCase } from '../models/HospitalCase.js'
import { HOSPITAL_ROLES } from '../models/User.js'
import { writeAudit } from '../utils/audit.js'

/** Hospital case statuses that give the hospital the right to see the patient's live data. */
export const CARE_STATUSES = ['accepted', 'arrived', 'admitted']

const idOf = (p) => String(p?._id ?? p)

/** Is this patient on a case at the user's hospital? */
async function hospitalHasPatient(user, patientId) {
  if (!user.hospitalId || !mongoose.isValidObjectId(patientId)) return false
  const [onCase, admitted] = await Promise.all([
    HospitalCase.exists({ hospital: user.hospitalId, patient: patientId, status: { $in: CARE_STATUSES } }),
    Admission.exists({ hospital: user.hospitalId, patient: patientId, status: 'admitted' }),
  ])
  return Boolean(onCase || admitted)
}

/**
 * Can this user see this patient's monitoring data?  `write: true` is for things only the patient
 * (or the central admin, for demos) may do for themselves: pressing SOS, confirming, adding symptoms.
 */
export async function canAccessPatient(user, patient, { write = false } = {}) {
  if (!user) return false
  const id = idOf(patient)
  if (user.role === 'central_admin') return true
  if (user.role === 'patient') return Boolean(user.patientId) && String(user.patientId) === id
  if (write) return false
  if (HOSPITAL_ROLES.includes(user.role)) return hospitalHasPatient(user, id)
  return false
}

/** Patients a user may list: `null` means all of them. */
export async function visiblePatientIds(user) {
  if (!user) return []
  if (user.role === 'central_admin') return null
  if (user.role === 'patient') return user.patientId ? [String(user.patientId)] : []
  if (!HOSPITAL_ROLES.includes(user.role) || !user.hospitalId) return []
  const [cases, admissions] = await Promise.all([
    HospitalCase.distinct('patient', { hospital: user.hospitalId, status: { $in: CARE_STATUSES }, patient: { $exists: true } }),
    Admission.distinct('patient', { hospital: user.hospitalId, status: 'admitted' }),
  ])
  return [...new Set([...cases, ...admissions].map(String))]
}

/** Can this user see an emergency case? The case record names the patient and the hospitals told about it. */
export async function canAccessCase(user, emergencyCase, opts = {}) {
  if (!emergencyCase) return false
  if (await canAccessPatient(user, emergencyCase.patient, opts)) return true
  if (opts.write || !HOSPITAL_ROLES.includes(user?.role) || !user.hospitalId) return false
  return Boolean(await HospitalCase.exists({ hospital: user.hospitalId, emergencyCaseId: String(emergencyCase._id), status: { $in: CARE_STATUSES } }))
}

const VIEW_LOG_MS = 5 * 60 * 1000
const recentViews = new Map() // "user|patient" -> ms of the last log entry

/**
 * Hospital staff reading a patient's live data is logged before anything is returned (audit rule, feature 98).
 * One entry per person and patient every five minutes, so a dashboard that polls does not flood the log.
 * The entry holds ids and the kind of view, never vitals.
 */
async function logHospitalView(req, patient) {
  if (!HOSPITAL_ROLES.includes(req.user?.role)) return
  const key = `${req.user.id}|${idOf(patient)}`
  const now = Date.now()
  if (now - (recentViews.get(key) ?? 0) < VIEW_LOG_MS) return
  await writeAudit({ req, action: 'record.view', resourceType: 'patient', resourceId: idOf(patient), meta: { kind: 'live_monitoring' }, strict: true })
  recentViews.set(key, now)
  if (recentViews.size > 5000) for (const [k, at] of recentViews) if (now - at > VIEW_LOG_MS) recentViews.delete(k)
}

/** Detection setting changes go to the audit log (action threshold.update): who, which scope, a one-line summary. */
export function auditDetectionChange(entry) {
  return writeAudit({
    actor: entry.actorId && mongoose.isValidObjectId(entry.actorId) ? entry.actorId : undefined,
    role: entry.actorRole,
    action: 'threshold.update',
    resourceType: 'detection_config',
    resourceId: entry.scope,
    meta: { summary: entry.summary },
  })
}

/** The options to hand to attachSimulation / attachDetection / attachEmergency. */
export function monitoringAccess() {
  return {
    guard: authenticate,
    presenterGuard: authorize('central_admin'), // scenario switching (a demo control)
    configGuard: authorize('central_admin'), // detection settings for everyone
    thresholdsGuard: authorize('doctor', 'central_admin'), // one patient's thresholds
    access: {
      patient: async (req, patient, opts) => {
        if (!(await canAccessPatient(req.user, patient, opts))) return false
        await logHospitalView(req, patient)
        return true
      },
      case: async (req, emergencyCase, opts) => {
        if (!(await canAccessCase(req.user, emergencyCase, opts))) return false
        await logHospitalView(req, emergencyCase.patient)
        return true
      },
      visibleIds: (req) => visiblePatientIds(req.user),
    },
    authorizeSubscribe: async (socket, patientId) => {
      const user = socket.data?.user
      if (!(await canAccessPatient(user, patientId))) return false
      await logHospitalView({ user }, patientId)
      return true
    },
  }
}
