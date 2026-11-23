// Phase 7: SOS and emergency management (features 41-50, 42). Ported from Daksh's emergency module.
//
// Every transition is ONE atomic conditional update filtered on the status we expect, never "read, decide, write".
// So when the 10 s deadline and "send now" race, or cancel races an accept, exactly one wins and the loser matches nothing.
// The server owns the clocks (deadline and 60 s rounds are stored on the case and re-armed after a restart).
// Hospital search is injected: discovery.notify({ caseId, round, radiusKm, ... }) (see ./discovery.js).
// Status names follow OUR case model (see ./status.js): his "searching" is our 'pending'.

import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { EmergencyCase, Detection, Patient } from '../models/index.js'
import {
  ACK_RECIPIENT_TYPES,
  ADMIN_ROOM,
  CANCEL_REASONS,
  CASE_SOURCE,
  EMERGENCY_EVENTS as EV,
  EMERGENCY_NUMBERS,
  ESCALATION,
  LOCATION_SOURCES,
  SYMPTOMS,
  hospitalRoom,
} from '../../../shared/emergency.js'
import { DETECTION_OUTCOME as OUT } from '../../../shared/detection.js'
import { SIMULATED_LABEL } from '../../../shared/vitals.js'
import { simCaseLocation } from '../monitoring/caseLocation.js'
import { S, ACTIVE, LIVE, PRE_ACCEPT, POST_ACCEPT } from './status.js'
import { alertText, buildWhatsAppLink, createDevNotifier } from './notifier.js'
import { emergencyRecord, emergencyContacts } from './patientRecord.js'

const ACTIVE_STATUSES = ACTIVE
const PRE_ACCEPT_STATUSES = PRE_ACCEPT
const POST_ACCEPT_STATUSES = POST_ACCEPT
const patientRoom = (id) => `patient:${id}`
const DUPLICATE_KEY = 11000
const TIMER_GRACE_MS = 50
// A Detection outcome only moves forward: a late "sent" must never overwrite "cancelled".
const OUTCOME_FROM = {
  [OUT.SENT]: [OUT.PENDING, OUT.CASE_CREATED],
  [OUT.CANCELLED]: [OUT.PENDING, OUT.CASE_CREATED, OUT.SENT],
  [OUT.FALSE_ALARM]: [OUT.PENDING, OUT.CASE_CREATED, OUT.SENT],
}

export const httpError = (status, message) => Object.assign(new Error(message), { status })
const entry = (type, message, data) => ({ event: type, at: new Date(), actorRole: 'system', detail: message, data })
const noDiscovery = { notify: async () => [] }

/** Keep only the four known symptoms, as booleans. Anything else is a 400. */
export function cleanSymptoms(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'symptoms must be an object')
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    if (!(key in SYMPTOMS)) throw httpError(400, `Unknown symptom "${key}". Use: ${Object.keys(SYMPTOMS).join(', ')}`)
    if (typeof value !== 'boolean') throw httpError(400, `symptoms.${key} must be true or false`)
    out[key] = value
  }
  return out
}


const SEVERITY_LEVEL = { low: 1, moderate: 1, high: 2, critical: 3 }

/** The location as the screens read it: the point plus accuracy, source and address. */
export function locationView(c) {
  if (!c?.location?.coordinates) return null
  return { point: { type: 'Point', coordinates: c.location.coordinates }, accuracyM: c.locationInfo?.accuracyM, source: c.locationInfo?.source, address: c.locationInfo?.address, updatedAt: c.locationInfo?.updatedAt }
}

/** Our timeline entry as the SOS screens read it ({ type, at, message }). */
export const timelineView = (t) => ({ type: t.event, at: t.at, actorRole: t.actorRole ?? 'system', message: t.detail ?? t.event.replace(/_/g, ' '), data: t.data })

export class EmergencyService {
  constructor({
    io = null,
    discovery = noDiscovery,
    notifier,
    contactsFor,
    patientRecordFor,
    logger = console,
    now = Date.now,
    publicUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    roundTimeoutMs = ESCALATION.ROUND_TIMEOUT_MS,
  } = {}) {
    this.io = io
    this.discovery = discovery
    this.logger = logger
    this.now = now
    this.publicUrl = publicUrl.replace(/\/$/, '')
    this.roundTimeoutMs = roundTimeoutMs
    this.notifier = notifier ?? createDevNotifier({ logger })
    this.patientRecordFor = patientRecordFor ?? (async (id) => emergencyRecord(await Patient.findById(id).lean()))
    this.contactsFor = contactsFor ?? (async (id) => emergencyContacts(await Patient.findById(id).lean()))
    this.timers = new Map()
  }

  // ---- events -------------------------------------------------------------------------------
  base(c) {
    return { caseId: String(c._id), patientId: String(c.patient), patientCode: c.patientCode ?? null, status: c.status, simulated: true, serverNow: new Date(this.now()).toISOString() }
  }

  emit(c, name, extra = {}) {
    this.io?.to(patientRoom(String(c.patient))).emit(name, { ...this.base(c), ...extra })
  }

  /** What the browser gets: the case without internals (tokens stay on the server). */
  toView(c) {
    if (!c) return null
    return {
      id: String(c._id),
      caseNumber: c.caseNumber ?? null,
      patientId: String(c.patient),
      patientCode: c.patientCode,
      source: c.source,
      severity: SEVERITY_LEVEL[c.severity] ?? 3,
      status: c.status,
      isLive: LIVE.includes(c.status),
      escalation: c.escalation,
      symptoms: c.symptoms ?? null,
      location: locationView(c),
      cancellation: c.cancellation ?? null,
      acknowledgements: c.acknowledgements ?? [],
      contactAlerts: (c.contactAlerts ?? []).map((a) => ({ name: a.name, relation: a.relation, channels: a.channels, sentAt: a.sentAt, whatsappLink: a.whatsappLink ?? null })),
      acceptedHospital: c.hospital ? String(c.hospital) : null,
      timeline: (c.timeline ?? []).map(timelineView),
      createdAt: c.createdAt ?? c.detectedAt,
      closedAt: c.closedAt ?? null,
      numbers: EMERGENCY_NUMBERS,
      simulated: true,
      notice: SIMULATED_LABEL,
      serverNow: new Date(this.now()).toISOString(), // the browser corrects its clock with this
    }
  }

  // ---- timers: server-authoritative, re-armed from the stored deadlines after a restart -----
  clear(caseId) {
    clearTimeout(this.timers.get(String(caseId)))
    this.timers.delete(String(caseId))
  }

  schedule(caseId, at, fn) {
    this.clear(caseId)
    const ms = Math.max(0, new Date(at).getTime() - this.now()) + TIMER_GRACE_MS
    const t = setTimeout(() => fn().catch((e) => this.logger.error?.('[emergency] timer failed', e)), ms)
    t.unref?.()
    this.timers.set(String(caseId), t)
  }

  /** Start the right timer for the case's current status. Accepts a case or an id. */
  async arm(caseOrId) {
    const c = caseOrId?.status ? caseOrId : await EmergencyCase.findById(caseOrId).lean()
    if (!c) return
    if (c.status === S.AWAITING && c.escalation?.confirmDeadline) {
      this.schedule(c._id, c.escalation.confirmDeadline, () => this.autoSend(c._id))
    } else if (c.status === S.SEARCHING && c.escalation?.roundStartedAt) {
      const round = c.escalation.round
      this.schedule(c._id, new Date(c.escalation.roundStartedAt).getTime() + this.roundTimeoutMs, () => this.escalate(c._id, round))
    }
  }

  /** Call once at startup: cases that were mid-countdown or mid-search when the server stopped resume. */
  async start() {
    const live = await EmergencyCase.find({ status: { $in: [S.AWAITING, S.SEARCHING] } }).lean()
    for (const c of live) await this.arm(c)
    return live.length
  }

  stop() {
    for (const id of [...this.timers.keys()]) this.clear(id)
  }

  // ---- 41: manual SOS joins the live case instead of creating a second one -------------------
  async sos(patientId, { location } = {}) {
    const loc = location ? this.toLocation(location) : undefined
    const where = loc ?? { point: { type: 'Point', coordinates: simCaseLocation() }, info: { source: 'demo_default', updatedAt: new Date(this.now()) } }
    const doc = {
      patient: patientId,
      source: CASE_SOURCE.MANUAL_SOS,
      severity: 'critical',
      status: S.SEARCHING, // the patient has already decided to ask for help: no countdown
      escalation: { round: 1, radiusKm: ESCALATION.RADII_KM[0], roundStartedAt: new Date(this.now()), autoSent: false },
      timeline: [{ ...entry('sos', 'Patient pressed SOS'), actorRole: 'patient' }],
      location: where.point,
      locationInfo: where.info,
      detectedAt: new Date(this.now()),
    }
    const filter = { patient: patientId, status: { $in: LIVE } }
    let found
    let created
    try {
      const res = await EmergencyCase.findOneAndUpdate(filter, { $setOnInsert: doc }, { upsert: true, new: true, includeResultMetadata: true })
      found = res.value.toObject()
      created = !res.lastErrorObject?.updatedExisting
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) throw err
      found = await EmergencyCase.findOne(filter).lean()
      created = false
      if (!found) throw err
    }
    if (created) {
      this.emit(found, EV.CREATED, { severity: 3, source: found.source })
      await this.afterSent(found, 'sos')
      return { case: this.toView(found), created: true, joined: false }
    }
    if (found.status === S.AWAITING) {
      const r = await this.confirm(found._id, {}, 'sos') // SOS during the countdown means "send now"
      if (loc) await this.updateLocation(found._id, location).catch(() => {})
      return { case: this.toView(r.case ?? found), created: false, joined: true }
    }
    if (loc) await this.updateLocation(found._id, location).catch(() => {})
    return { case: this.toView(await EmergencyCase.findById(found._id).lean()), created: false, joined: true }
  }

  // ---- 43, 44: confirm now, or auto-send when the deadline passes ---------------------------
  async confirm(caseId, symptoms = {}, how = 'manual') {
    const clean = cleanSymptoms(symptoms)
    const set = { 'symptoms.answeredAt': new Date(this.now()), 'symptoms.noResponse': false }
    for (const [k, v] of Object.entries(clean)) set[`symptoms.${k}`] = v
    const sent = await this.toSearching(caseId, set, how)
    if (sent) return { changed: true, case: sent }
    return { changed: false, case: await this.find(caseId) }
  }

  /** The patient ticks a symptom before the countdown ends: kept even if the countdown then auto-sends. */
  async recordSymptoms(caseId, symptoms) {
    const clean = cleanSymptoms(symptoms)
    const set = { 'symptoms.answeredAt': new Date(this.now()), 'symptoms.noResponse': false }
    for (const [k, v] of Object.entries(clean)) set[`symptoms.${k}`] = v
    const c = await EmergencyCase.findOneAndUpdate({ _id: this.id(caseId), status: { $in: ACTIVE_STATUSES } }, { $set: set }, { new: true }).lean()
    if (!c) throw httpError(404, 'No live case with that id')
    return c
  }

  async autoSend(caseId) {
    const c = await this.toSearching(caseId, { 'escalation.autoSent': true }, 'auto')
    if (c) await EmergencyCase.updateOne({ _id: c._id, 'symptoms.answeredAt': { $exists: false } }, { $set: { 'symptoms.noResponse': true } })
    return c
  }

  async toSearching(caseId, set, how) {
    const now = new Date(this.now())
    const message = { auto: 'No response in 10 s: sent automatically', sos: 'Patient pressed SOS: sent now', manual: 'Patient confirmed: sent now' }[how]
    const c = await EmergencyCase.findOneAndUpdate(
      { _id: this.id(caseId), status: S.AWAITING },
      {
        $set: { status: S.SEARCHING, 'escalation.round': 1, 'escalation.radiusKm': ESCALATION.RADII_KM[0], 'escalation.roundStartedAt': now, ...set },
        $push: { timeline: { ...entry('sent', message, { how }), actorRole: how === 'auto' ? 'system' : 'patient' } },
      },
      { new: true },
    ).lean()
    if (!c) return null // the deadline, a confirm or a cancel moved it first
    if (how !== 'auto') this.emit(c, EV.CONFIRMED, { how })
    await this.afterSent(c, how)
    return c
  }

  async afterSent(c, how) {
    await this.setOutcome(c, OUT.SENT)
    this.emit(c, EV.SENT, { how, round: c.escalation.round, radiusKm: c.escalation.radiusKm })
    await this.alertContacts(c)
    await this.notifyDiscovery(c)
    await this.arm(c)
  }

  async notifyDiscovery(c) {
    try {
      await this.discovery.notify({
        caseId: String(c._id),
        round: c.escalation.round,
        radiusKm: c.escalation.radiusKm,
        location: locationView(c),
        caseSnapshot: { severity: c.severity, source: c.source, symptoms: c.symptoms },
      })
    } catch (err) {
      this.logger.error?.('[emergency] hospital discovery failed', err)
    }
  }

  // ---- 45: no accept in 60 s -> 10 -> 20 -> 30 km, then unresolved + central admin + "call 112" ---
  async escalate(caseId, round) {
    const now = new Date(this.now())
    // Matching on the status AND the round means a case that was just accepted, cancelled or already widened is left alone.
    const filter = { _id: this.id(caseId), status: S.SEARCHING, 'escalation.round': round }
    if (round < ESCALATION.RADII_KM.length) {
      const radiusKm = ESCALATION.RADII_KM[round]
      const c = await EmergencyCase.findOneAndUpdate(
        filter,
        {
          $set: { 'escalation.round': round + 1, 'escalation.radiusKm': radiusKm, 'escalation.roundStartedAt': now },
          $push: { timeline: entry('escalated', `No hospital accepted yet: widening the search to ${radiusKm} km`, { round: round + 1, radiusKm }) },
        },
        { new: true },
      ).lean()
      if (!c) return null
      this.emit(c, EV.ESCALATED, { round: round + 1, radiusKm })
      await this.notifyDiscovery(c)
      await this.arm(c)
      return c
    }
    const c = await EmergencyCase.findOneAndUpdate(
      filter,
      { $set: { status: S.UNRESOLVED, 'escalation.centralAdminAlertedAt': now }, $push: { timeline: entry('unresolved', 'No hospital accepted in 3 rounds: central admin alerted, patient told to call 112') } },
      { new: true },
    ).lean()
    if (!c) return null
    this.clear(caseId)
    this.emit(c, EV.UNRESOLVED, { message: 'No hospital has accepted yet. Call 112 now.', numbers: EMERGENCY_NUMBERS })
    this.io?.to(ADMIN_ROOM).emit(EV.UNRESOLVED, { ...this.base(c), location: locationView(c) }) // joined only by central_admin (see index.js)
    return c
  }

  // ---- 49: cancel with a reason, before or after a hospital accepted --------------------------
  async cancel(caseId, { reason, note, actor = {} } = {}) {
    if (!CANCEL_REASONS.includes(reason)) throw httpError(400, `reason must be one of: ${CANCEL_REASONS.join(', ')}`)
    if (note !== undefined && (typeof note !== 'string' || note.length > 500)) throw httpError(400, 'note must be text of at most 500 characters')
    const id = this.id(caseId)
    const now = new Date(this.now())
    const update = (afterAcceptance) => ({
      $set: { status: S.CANCELLED, closedAt: now, cancellation: { reason, note, cancelledAt: now, afterAcceptance } },
      $push: { timeline: { ...entry('cancelled', `Cancelled: ${reason.replace(/_/g, ' ')}`, { reason, afterAcceptance }), actorRole: actor.role ?? 'patient', actorId: actor.id } },
    })
    // Two attempts: if a hospital accepts between them, the second one still catches the case.
    let c = await EmergencyCase.findOneAndUpdate({ _id: id, status: { $in: PRE_ACCEPT_STATUSES } }, update(false), { new: true }).lean()
    if (!c) c = await EmergencyCase.findOneAndUpdate({ _id: id, status: { $in: POST_ACCEPT_STATUSES } }, update(true), { new: true }).lean()
    if (!c) {
      const existing = await this.find(id)
      throw httpError(existing ? 409 : 404, existing ? `The case is already ${existing.status.replace(/_/g, ' ')}` : 'Case not found')
    }
    this.clear(id)
    await this.setOutcome(c, reason === 'false_alarm' ? OUT.FALSE_ALARM : OUT.CANCELLED)
    const after = c.cancellation.afterAcceptance
    const payload = {
      reason,
      afterAcceptance: after,
      hospitalId: after && c.hospital ? String(c.hospital) : undefined,
      ambulanceId: after && c.ambulance ? String(c.ambulance) : undefined,
    }
    this.emit(c, EV.CANCELLED, payload)
    if (after) await this.releaseCrew(c)
    // The accepting hospital and the crew must hear it (the ambulance is released from their side).
    if (payload.hospitalId) this.io?.to(hospitalRoom(payload.hospitalId)).emit(EV.CANCELLED, { ...this.base(c), ...payload }) 
    return c
  }


  /**
   * The patient cancelled after a hospital accepted: stop the trip and free the ambulance. Best effort: the cancel itself
   * has already happened, and the hospital room has been told (it carries ambulanceId so the crew screen can react).
   */
  async releaseCrew(c) {
    try {
      const { endTripIfOpen } = await import('../services/tripRepo.js')
      const { freeAmbulance, getAmbulance } = await import('../services/ambulanceRepo.js')
      await endTripIfOpen(c._id, new Date(this.now()))
      if (c.ambulance) {
        const a = await getAmbulance(c.ambulance)
        const at = a?.location?.coordinates
        if (at) await freeAmbulance(c.ambulance, c._id, at)
      }
    } catch (err) {
      this.logger.error?.('[emergency] could not release the ambulance after cancel', err)
    }
  }

  // ---- 46: live location ------------------------------------------------------------------
  toLocation({ lng, lat, accuracyM, source = 'gps', address } = {}) {
    if (![lng, lat].every((n) => typeof n === 'number' && Number.isFinite(n)) || Math.abs(lng) > 180 || Math.abs(lat) > 90) throw httpError(400, 'lng and lat must be numbers (longitude -180..180, latitude -90..90)')
    if (!LOCATION_SOURCES.includes(source)) throw httpError(400, `source must be one of: ${LOCATION_SOURCES.join(', ')}`)
    if (accepted(accuracyM) && !(typeof accuracyM === 'number' && accuracyM >= 0 && accuracyM <= 100000)) throw httpError(400, 'accuracyM must be a number of metres')
    if (address !== undefined && (typeof address !== 'string' || address.length > 300)) throw httpError(400, 'address must be text of at most 300 characters')
    return { point: { type: 'Point', coordinates: [lng, lat] }, info: { ...(accepted(accuracyM) && { accuracyM }), source, ...(address && { address }), updatedAt: new Date(this.now()) } }
  }

  async updateLocation(caseId, loc) {
    const where = this.toLocation(loc)
    const c = await EmergencyCase.findOneAndUpdate({ _id: this.id(caseId), status: { $in: LIVE } }, { $set: { location: where.point, locationInfo: where.info } }, { new: true }).lean()
    if (!c) throw httpError(404, 'No live case with that id')
    this.emit(c, EV.LOCATION, { location: locationView(c) })
    return c
  }

  // ---- 47: alert emergency contacts (once per case) ------------------------------------------
  async alertContacts(c) {
    let contacts = []
    try {
      contacts = (await this.contactsFor(c.patient)) ?? []
    } catch (err) {
      this.logger.error?.('[emergency] could not read emergency contacts', err)
    }
    if (!contacts.length) return null
    const patientName = (await this.patientRecordFor(c.patient).catch(() => null))?.name ?? 'A HealthTwin patient'
    const planned = contacts.map((contact) => {
      const token = randomBytes(16).toString('hex')
      const link = `${this.publicUrl}/status/${token}`
      const text = alertText({ patientName, link })
      const whatsappLink = contact.whatsapp === false ? null : buildWhatsAppLink(contact.phone, text)
      const channels = [contact.email && 'email', contact.pushSubscription && 'push', whatsappLink && 'whatsapp'].filter(Boolean)
      return { contact, link, text, record: { name: contact.name, relation: contact.relation, phone: contact.phone, email: contact.email, channels, statusLinkToken: token, whatsappLink, sentAt: new Date(this.now()) } }
    })
    // Recorded first, and only if no alert exists yet, so a repeat call can never alert twice.
    const updated = await EmergencyCase.findOneAndUpdate(
      { _id: c._id, 'contactAlerts.0': { $exists: false } },
      { $push: { contactAlerts: { $each: planned.map((p) => p.record) }, timeline: entry('contacts_alerted', `${planned.length} emergency contact(s) alerted`, { count: planned.length }) } },
      { new: true },
    ).lean()
    if (!updated) return null
    for (const p of planned) {
      if (p.contact.email) await this.deliver('email', { to: p.contact.email, subject: 'SIMULATED HealthTwin emergency alert', text: p.text, link: p.link })
      if (p.contact.pushSubscription) await this.deliver('push', { to: p.contact.pushSubscription, text: p.text, link: p.link })
    }
    this.emit(updated, EV.CONTACTS, { count: planned.length })
    return updated
  }

  async deliver(channel, msg) {
    try {
      await this.notifier[channel]?.(msg)
    } catch (err) {
      this.logger.error?.(`[emergency] ${channel} alert failed`, err) // one failing channel never blocks the emergency
    }
  }

  // ---- 48: "Seen", recorded once per recipient ------------------------------------------------
  async acknowledge(caseId, { recipientType, recipientId, name } = {}) {
    if (!ACK_RECIPIENT_TYPES.includes(recipientType)) throw httpError(400, `recipientType must be one of: ${ACK_RECIPIENT_TYPES.join(', ')}`)
    if (typeof recipientId !== 'string' || !recipientId.trim()) throw httpError(400, 'recipientId is required')
    const c = await EmergencyCase.findOneAndUpdate(
      { _id: this.id(caseId), acknowledgements: { $not: { $elemMatch: { recipientType, recipientId } } } },
      { $push: { acknowledgements: { recipientType, recipientId, name, seenAt: new Date(this.now()) } } },
      { new: true },
    ).lean()
    if (c) this.emit(c, EV.ACK, { recipientType, recipientId, name })
    return { recorded: Boolean(c) }
  }

  /** The family status page: the token in the link is the credential. Shows only what a relative needs. */
  async publicStatus(token) {
    const c = await EmergencyCase.findOne({ 'contactAlerts.statusLinkToken': String(token) }).lean()
    if (!c) return null
    const patient = await this.patientRecordFor(c.patient).catch(() => null)
    const alert = c.contactAlerts.find((a) => a.statusLinkToken === token)
    const seen = c.acknowledgements.some((a) => a.recipientType === 'contact' && a.recipientId === contactKey(alert))
    return {
      patientName: patient?.name ?? 'A HealthTwin patient',
      contactName: alert.name,
      status: c.status,
      isLive: LIVE.includes(c.status),
      severity: c.severity,
      since: c.createdAt ?? c.detectedAt,
      cancellation: c.cancellation ? { reason: c.cancellation.reason } : null,
      location: c.location?.coordinates ? { lat: c.location.coordinates[1], lng: c.location.coordinates[0], accuracyM: c.locationInfo?.accuracyM, updatedAt: c.locationInfo?.updatedAt } : null,
      seen,
      numbers: EMERGENCY_NUMBERS,
      simulated: true,
      notice: SIMULATED_LABEL,
      serverNow: new Date(this.now()).toISOString(),
    }
  }

  async seenByToken(token) {
    const c = await EmergencyCase.findOne({ 'contactAlerts.statusLinkToken': String(token) }).lean()
    if (!c) return null
    const alert = c.contactAlerts.find((a) => a.statusLinkToken === token)
    const out = await this.acknowledge(c._id, { recipientType: 'contact', recipientId: contactKey(alert), name: alert.name })
    return { ...out, seen: true }
  }

  // ---- 50: the patient's incident history ----------------------------------------------------
  async history(patientId, { page = 1, limit = 10 } = {}) {
    const filter = { patient: patientId }
    const [items, total] = await Promise.all([
      EmergencyCase.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      EmergencyCase.countDocuments(filter),
    ])
    return { items: items.map((c) => this.toView(c)), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), simulated: true }
  }

  /** The patient's live case, if any: lets the confirmation screen come back after a page reload. */
  async active(patientId) {
    const c = await EmergencyCase.findOne({ patient: patientId, status: { $in: LIVE } }).sort({ createdAt: -1 }).lean()
    return c ? this.toView(c) : null
  }

  async get(caseId) {
    const c = await this.find(caseId)
    return c ? this.toView(c) : null
  }

  // ---- helpers ------------------------------------------------------------------------------
  id(caseId) {
    if (!mongoose.isValidObjectId(caseId)) throw httpError(404, 'Case not found')
    return caseId
  }

  find(caseId) {
    return EmergencyCase.findById(this.id(caseId)).lean()
  }

  /** Feature 40: keep Detection.outcome in step with the case. Only moves forward. */
  async setOutcome(c, outcome) {
    if (!c.detectionRef) return
    await Detection.updateOne({ _id: c.detectionRef, outcome: { $in: OUTCOME_FROM[outcome] } }, { $set: { outcome } })
  }
}

const accepted = (v) => v !== undefined && v !== null
const contactKey = (alert) => alert.phone ?? alert.email ?? alert.statusLinkToken
