// Features 62-70, 95, 103: what a hospital does with an emergency it was told about.

import { EmergencyCase } from '../models/EmergencyCase.js'
import { Doctor } from '../models/Doctor.js'
import { Hospital } from '../models/Hospital.js'
import { HospitalCase } from '../models/HospitalCase.js'
import { Patient } from '../models/Patient.js'
import { Ambulance } from '../models/Ambulance.js'
import { buildHealthSummary } from '../services/healthSummary.js'
import { presentPatient, getEmergencySummary } from '../services/patientSummary.js'
import { updateHospitalCase } from '../services/hospitalCases.js'
import { writeAudit } from '../utils/audit.js'
import { CASE_STATUS, HOSPITAL_RESPONSE, REJECT_REASONS, hospitalRoom, ADMIN_ROOM } from '../../../shared/emergency.js'
import { PREPARATION_ITEMS, RESPONSE_EVENTS as EV, byPriority, goldenHour } from '../../../shared/response.js'

const patientRoom = (id) => `patient:${id}`
const entry = (type, message, data, actor = {}) => ({ type, at: new Date(), actorRole: actor.role ?? 'system', actorId: actor.id ? String(actor.id) : undefined, message, data })
const fail = (status, message, code) => Object.assign(new Error(message), { status, code })
const LIVE_FOR_HOSPITAL = ['received', 'accepted', 'arrived']

export class ResponseService {
  constructor({ io, discovery, ambulances, pusher = null, logger = console, now = () => Date.now() } = {}) {
    Object.assign(this, { io, discovery, ambulances, pusher, logger, now })
  }

  /** The hospital's response row on a case, or null. Rejected and superseded hospitals lose access (63). */
  responseOf(c, hospitalId) {
    return (c.hospitalResponses ?? []).find((r) => String(r.hospital) === String(hospitalId)) ?? null
  }

  // ---- 62, 64, 95: the live queue --------------------------------------------------------------
  async incoming(hospitalId) {
    const rows = await HospitalCase.find({ hospital: hospitalId, status: { $in: LIVE_FOR_HOSPITAL } }).lean()
    const cases = await EmergencyCase.find({ _id: { $in: rows.map((r) => r.emergencyCaseId).filter((id) => /^[a-f\d]{24}$/i.test(id)) } }).lean()
    const byId = new Map(cases.map((c) => [String(c._id), c]))
    const now = this.now()
    const items = []
    for (const row of rows) {
      const c = byId.get(row.emergencyCaseId)
      if (!c || [CASE_STATUS.CANCELLED, CASE_STATUS.CLOSED].includes(c.status)) continue
      const mine = this.responseOf(c, hospitalId)
      items.push({
        id: String(c._id),
        hospitalCaseId: String(row._id),
        caseNumber: c.caseNumber ?? null,
        patientCode: c.patientCode,
        status: c.status,
        myStatus: row.status,
        severity: c.severity,
        riskScore: c.detection?.riskScore ?? 0,
        vitals: c.detection?.snapshot ?? null,
        distanceKm: mine?.distanceKm ?? 0,
        receivedAt: row.receivedAt,
        respondBy: mine ? new Date(new Date(mine.notifiedAt).getTime() + 60_000).toISOString() : null,
        waitingMs: now - new Date(row.receivedAt).getTime(),
        acceptedByOther: Boolean(c.acceptedHospital && String(c.acceptedHospital) !== String(hospitalId)),
        needsResponse: row.status === 'received' && c.status === CASE_STATUS.SEARCHING,
        goldenHour: goldenHour(c, now),
      })
    }
    return items.filter((i) => !i.acceptedByOther).sort(byPriority)
  }

  // ---- 63: patient information sharing ---------------------------------------------------------
  /** The case plus the handover. Only a hospital that was told about it and has not lost it; every view is logged first. */
  async caseForHospital(caseId, hospitalId, req) {
    const c = await this.findCase(caseId)
    const mine = this.responseOf(c, hospitalId)
    if (!mine || [HOSPITAL_RESPONSE.REJECTED, HOSPITAL_RESPONSE.SUPERSEDED].includes(mine.status)) throw fail(404, 'Case not found')
    const ended = [CASE_STATUS.CANCELLED, CASE_STATUS.CLOSED].includes(c.status)
    let handover = null
    if (!ended) {
      await writeAudit({ req, action: 'record.view', resourceType: 'emergency_case', resourceId: c._id, hospitalId, strict: true, meta: { kind: 'emergency_handover', patientId: c.patientCode } })
      const patient = await Patient.findById(c.patient)
      if (patient) {
        const snap = c.detection?.snapshot
        handover = {
          passport: await getEmergencySummary(patient),
          profile: (({ allergies, medications, cardiacConditions, medicalConditions, familyHistory, bloodGroup, fullName, dateOfBirth, gender }) => ({ allergies, medications, cardiacConditions, medicalConditions, familyHistory, bloodGroup, fullName, dateOfBirth, gender }))(presentPatient(patient)),
          symptoms: c.symptoms ?? null,
          twin: { riskScore: c.detection?.riskScore ?? null, riskBreakdown: c.detection?.riskBreakdown ?? [], rulesFired: c.detection?.rulesFired ?? [], snapshot: snap ?? null },
          healthSummary: buildHealthSummary(patient, { latest: snap && { heartRate: snap.hr, systolic: snap.sys, diastolic: snap.dia, spo2: snap.spo2, temperatureC: snap.temp } }),
        }
      }
    }
    return { case: await this.view(c, hospitalId), handover, simulated: true }
  }

  async view(c, hospitalId) {
    const [doctor, ambulance, hospital] = await Promise.all([
      c.assignedDoctor ? Doctor.findById(c.assignedDoctor).lean() : null,
      c.ambulance ? Ambulance.findById(c.ambulance).lean() : null,
      c.acceptedHospital ? Hospital.findById(c.acceptedHospital).lean() : null,
    ])
    const mine = hospitalId ? this.responseOf(c, hospitalId) : null
    return {
      id: String(c._id),
      caseNumber: c.caseNumber ?? null,
      patientCode: c.patientCode,
      status: c.status,
      severity: c.severity,
      riskScore: c.detection?.riskScore ?? null,
      location: c.location ? { point: c.location.point, address: c.location.address ?? null } : null,
      hospital: hospital && { id: String(hospital._id), name: hospital.name, phone: hospital.phone },
      acceptedByMe: Boolean(hospitalId && c.acceptedHospital && String(c.acceptedHospital) === String(hospitalId)),
      myResponse: mine && { status: mine.status, rank: mine.rank, distanceKm: mine.distanceKm, notifiedAt: mine.notifiedAt },
      doctor: doctor && { id: String(doctor._id), name: doctor.fullName, specialization: doctor.specialization },
      preparation: c.preparation ?? {},
      ambulance: ambulance && { ...this.ambulances.payload(c, ambulance), crew: ambulance.crew, route: this.ambulances.routeFor(ambulance.trip) },
      timeline: c.timeline ?? [],
      goldenHour: goldenHour(c, this.now()),
      createdAt: c.createdAt,
    }
  }

  async findCase(caseId) {
    if (!/^[a-f\d]{24}$/i.test(String(caseId))) throw fail(404, 'Case not found')
    const c = await EmergencyCase.findById(caseId).lean()
    if (!c) throw fail(404, 'Case not found')
    return c
  }

  // ---- 65, 67: acceptance ----------------------------------------------------------------------
  async accept(caseId, hospitalId, user, req) {
    await this.findCase(caseId)
    const c = await EmergencyCase.acceptIfPending(caseId, hospitalId, user.id)
    if (!c) {
      const now = await this.findCase(caseId)
      const mine = this.responseOf(now, hospitalId)
      if (!mine) throw fail(404, 'Case not found')
      if (now.acceptedHospital && String(now.acceptedHospital) !== String(hospitalId)) throw fail(409, 'Accepted by another hospital', 'ACCEPTED_BY_OTHER')
      throw fail(409, 'This case can no longer be accepted', 'NOT_PENDING')
    }
    const accepted = c.toObject ? c.toObject() : c
    const hospital = await Hospital.findById(hospitalId).lean()
    const mine = this.responseOf(accepted, hospitalId)
    const etaMinutes = mine?.distanceKm ? Math.max(1, Math.round((mine.distanceKm * 1.3 / 40) * 60)) : undefined
    await updateHospitalCase({ hospitalId, emergencyCaseId: String(caseId) }, { status: 'accepted', etaMinutes })
    const others = await HospitalCase.find({ emergencyCaseId: String(caseId), hospital: { $ne: hospitalId }, status: 'received' }).lean()
    await HospitalCase.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { status: 'rejected', respondedAt: new Date(), rejectionReason: 'Accepted by another hospital' } })
    for (const o of others) this.io?.to(hospitalRoom(o.hospital)).emit(EV.TAKEN, { caseId: String(caseId), message: 'Accepted by another hospital', simulated: true })
    await writeAudit({ req, action: 'emergency.accept', resourceType: 'emergency_case', resourceId: caseId, hospitalId, meta: { patientId: accepted.patientCode } })

    const message = `${hospital?.name ?? 'A hospital'} accepted your emergency. Ambulance being assigned.`
    const payload = { caseId: String(caseId), hospital: { id: String(hospitalId), name: hospital?.name, phone: hospital?.phone }, message, etaMinutes, simulated: true }
    this.io?.to(patientRoom(accepted.patient)).emit(EV.ACCEPTED, payload)
    this.io?.to(hospitalRoom(hospitalId)).emit(EV.ACCEPTED, payload)
    this.io?.to(ADMIN_ROOM).emit(EV.ACCEPTED, payload)
    this.pusher?.toContacts(caseId, { title: 'A hospital accepted', body: message }).catch(() => {}) // 47, 67

    let ambulance = null
    try { ambulance = await this.ambulances.assign(caseId, hospitalId, { actor: { role: 'system' } }) } catch (err) { this.logger.error?.('[response] ambulance assignment failed', err.message) }
    return { case: await this.view(await this.findCase(caseId), hospitalId), ambulanceAssigned: Boolean(ambulance) }
  }

  // ---- 66, 60: rejection -----------------------------------------------------------------------
  async reject(caseId, hospitalId, user, { reason, note } = {}, req) {
    if (!REJECT_REASONS.includes(reason)) throw fail(400, `reason must be one of: ${REJECT_REASONS.join(', ')}`)
    if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw fail(400, 'note must be text of at most 300 characters')
    await this.findCase(caseId)
    const now = new Date(this.now())
    const c = await EmergencyCase.findOneAndUpdate(
      { _id: caseId, status: CASE_STATUS.SEARCHING, hospitalResponses: { $elemMatch: { hospital: hospitalId, status: HOSPITAL_RESPONSE.NOTIFIED } } },
      {
        $set: { 'hospitalResponses.$[r].status': HOSPITAL_RESPONSE.REJECTED, 'hospitalResponses.$[r].rejectReason': reason, 'hospitalResponses.$[r].rejectNote': note, 'hospitalResponses.$[r].respondedAt': now, 'hospitalResponses.$[r].respondedBy': user.id },
        $push: { timeline: entry('hospital_rejected', `Rejected: ${reason.replace(/_/g, ' ')}`, { hospital: String(hospitalId), reason }, { role: user.role, id: user.id }) },
      },
      { arrayFilters: [{ 'r.hospital': hospitalId, 'r.status': HOSPITAL_RESPONSE.NOTIFIED }], returnDocument: 'after' },
    ).lean()
    if (!c) throw fail(409, 'This case is no longer waiting for your answer', 'NOT_PENDING')
    await updateHospitalCase({ hospitalId, emergencyCaseId: String(caseId) }, { status: 'rejected', rejectionReason: reason })
    await writeAudit({ req, action: 'emergency.reject', resourceType: 'emergency_case', resourceId: caseId, hospitalId, meta: { reason } })
    const hospital = await Hospital.findById(hospitalId).lean()
    const next = await this.discovery.notifyNext(caseId, 1).catch((err) => { this.logger.error?.('[response] next hospital failed', err.message); return [] })
    this.io?.to(patientRoom(c.patient)).emit(EV.REJECTED, { caseId: String(caseId), hospital: hospital?.name, reason, nextHospitals: next.map((n) => n.name), simulated: true })
    return { ok: true, nextNotified: next.map((n) => ({ hospital: n.hospital, name: n.name })) }
  }

  // ---- 68: doctor assignment -------------------------------------------------------------------
  async assignDoctor(caseId, hospitalId, doctorId, user) {
    const c = await this.findCase(caseId)
    if (String(c.acceptedHospital) !== String(hospitalId)) throw fail(404, 'Case not found')
    const doctor = await Doctor.findOne({ _id: doctorId, hospital: hospitalId, isActive: true, onDuty: true }).lean()
    if (!doctor) throw fail(409, 'Choose a doctor who is on duty at this hospital')
    await EmergencyCase.updateOne({ _id: caseId }, { $set: { assignedDoctor: doctor._id }, $push: { timeline: entry('doctor_assigned', `${doctor.fullName} assigned`, { doctor: String(doctor._id) }, { role: user.role, id: user.id }) } })
    const p = { caseId: String(caseId), doctor: { id: String(doctor._id), name: doctor.fullName, specialization: doctor.specialization, userId: doctor.user ? String(doctor.user) : null }, simulated: true }
    this.io?.to(hospitalRoom(hospitalId)).emit(EV.DOCTOR, p)
    this.io?.to(patientRoom(c.patient)).emit(EV.DOCTOR, p)
    return p.doctor
  }

  // ---- 69: preparation checklist ---------------------------------------------------------------
  async setPreparation(caseId, hospitalId, patch, user) {
    const c = await this.findCase(caseId)
    if (String(c.acceptedHospital) !== String(hospitalId)) throw fail(404, 'Case not found')
    const items = Object.keys(patch ?? {})
    if (!items.length || items.some((k) => !(k in PREPARATION_ITEMS) || typeof patch[k] !== 'boolean')) throw fail(400, `Send true or false for: ${Object.keys(PREPARATION_ITEMS).join(', ')}`)
    const set = Object.fromEntries(items.map((k) => [`preparation.${k}`, patch[k]]))
    const events = items.map((k) => entry('preparation', `${PREPARATION_ITEMS[k]}: ${patch[k] ? 'done' : 'not done'}`, { item: k, value: patch[k] }, { role: user.role, id: user.id }))
    const updated = await EmergencyCase.findOneAndUpdate({ _id: caseId }, { $set: set, $push: { timeline: { $each: events } } }, { returnDocument: 'after' }).lean()
    const p = { caseId: String(caseId), preparation: updated.preparation, simulated: true }
    this.io?.to(hospitalRoom(hospitalId)).emit(EV.PREPARATION, p)
    this.io?.to(patientRoom(c.patient)).emit(EV.PREPARATION, p)
    return updated.preparation
  }

  // ---- 67, 70, 76, 77: what the patient, family and crew follow -------------------------------
  async track(caseId) {
    const c = await this.findCase(caseId)
    const view = await this.view(c, null)
    const alternatives = await Promise.all((c.hospitalResponses ?? []).map(async (r) => ({ ...(await Hospital.findById(r.hospital, { name: 1, phone: 1, address: 1, location: 1 }).lean().then((h) => ({ id: String(h?._id), name: h?.name, phone: h?.phone, address: h?.address, location: h?.location }))), status: r.status, rank: r.rank, distanceKm: r.distanceKm, score: r.score, rejectReason: r.rejectReason })))
    return { ...view, alternatives, simulated: true }
  }
}
