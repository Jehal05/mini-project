// Features 71-80 and 107: the ambulance fleet, assignment, dispatch and the simulated trip.
//
// No hardware and no routing service: a vehicle moves along the straight line between its start, the patient and the
// hospital (times a road factor) every 2 seconds. Everything it sends is marked `simulated: true`.

import { Ambulance } from '../models/Ambulance.js'
import { EmergencyCase } from '../models/EmergencyCase.js'
import { Hospital } from '../models/Hospital.js'
import { updateHospitalCase } from '../services/hospitalCases.js'
import { ADMIN_ROOM, CASE_STATUS, hospitalRoom } from '../../../shared/emergency.js'
import { RESPONSE_EVENTS as EV, TRIP_LABEL, TRIP_STAGES } from '../../../shared/response.js'
import { distanceKm, lerpPoint, ROAD_FACTOR, routeLine } from './geo.js'

export const TICK_MS = 2000 // feature 75
const MOVING = ['en_route', 'en_route_to_hospital']
const patientRoom = (id) => `patient:${id}`
const entry = (type, message, data, actor = {}) => ({ type, at: new Date(), actorRole: actor.role ?? 'system', actorId: actor.id ? String(actor.id) : undefined, message, data })
const fail = (status, message) => Object.assign(new Error(message), { status })

export class AmbulanceService {
  constructor({ io, logger = console, now = () => Date.now(), speedKmh = 60, tickMs = TICK_MS } = {}) {
    Object.assign(this, { io, logger, now, speedKmh, tickMs })
    this.timer = null
  }

  // ---- 71, 72: fleet ---------------------------------------------------------------------------
  async register(hospitalId, data) {
    const hospital = await Hospital.findById(hospitalId).lean()
    if (!hospital) throw fail(404, 'Hospital not found')
    try {
      return await Ambulance.create({ ...data, hospital: hospitalId, status: 'available', position: hospital.location })
    } catch (err) {
      if (err?.code === 11000) throw fail(409, 'That vehicle number is already registered')
      throw err
    }
  }

  list(hospitalId) {
    return Ambulance.find({ hospital: hospitalId }).sort({ vehicleNumber: 1 }).lean()
  }

  async counts(hospitalId) {
    const rows = await Ambulance.aggregate([{ $match: { hospital: new (await import('mongoose')).default.Types.ObjectId(String(hospitalId)) } }, { $group: { _id: '$status', n: { $sum: 1 } } }])
    return Object.fromEntries(['available', 'dispatched', 'on_trip', 'maintenance'].map((s) => [s, rows.find((r) => r._id === s)?.n ?? 0]))
  }

  /** Only an idle vehicle can change between available and maintenance. */
  async setStatus(hospitalId, id, status) {
    if (!['available', 'maintenance'].includes(status)) throw fail(400, 'status must be available or maintenance')
    const a = await Ambulance.findOneAndUpdate({ _id: id, hospital: hospitalId, status: { $in: ['available', 'maintenance'] } }, { $set: { status } }, { returnDocument: 'after' }).lean()
    if (!a) throw fail(409, 'A vehicle on a trip cannot change status')
    return a
  }

  // ---- 73, 74: assignment and dispatch ---------------------------------------------------------
  /** The accepting hospital's nearest available vehicle, ALS first for a cardiac case; staff may name one instead. */
  async assign(caseId, hospitalId, { ambulanceId, actor } = {}) {
    const c = await EmergencyCase.findById(caseId).lean()
    if (!c || String(c.acceptedHospital) !== String(hospitalId)) throw fail(404, 'Case not found')
    if (![CASE_STATUS.ACCEPTED, CASE_STATUS.AMBULANCE_ASSIGNED].includes(c.status)) throw fail(409, 'This case cannot get an ambulance now')
    const patientPoint = c.location?.point?.coordinates
    const hospital = await Hospital.findById(hospitalId).lean()
    if (!patientPoint || !hospital) throw fail(409, 'The case has no location yet')

    let chosen
    if (ambulanceId) {
      chosen = await Ambulance.findOne({ _id: ambulanceId, hospital: hospitalId, status: 'available' }).lean()
      if (!chosen) throw fail(409, 'That ambulance is not available')
    } else {
      if (c.ambulance) return Ambulance.findById(c.ambulance).lean() // already has one
      const free = await Ambulance.find({ hospital: hospitalId, status: 'available' }).lean()
      chosen = free.sort((a, b) => (b.type === 'ALS') - (a.type === 'ALS') || distanceKm(a.position.coordinates, patientPoint) - distanceKm(b.position.coordinates, patientPoint))[0]
    }
    if (!chosen) {
      await EmergencyCase.updateOne({ _id: c._id }, { $push: { timeline: entry('no_ambulance', 'No ambulance is free: assign one by hand or call 108') } })
      this.io?.to(hospitalRoom(hospitalId)).emit(EV.AMBULANCE_UNAVAILABLE, { caseId: String(c._id), simulated: true })
      return null
    }
    if (c.ambulance && String(c.ambulance) !== String(chosen._id)) await this.release(c.ambulance, 'replaced')

    const from = chosen.position.coordinates
    const now = new Date(this.now())
    const claimed = await Ambulance.findOneAndUpdate(
      { _id: chosen._id, status: 'available' },
      {
        $set: {
          status: 'dispatched',
          trip: { caseId: String(c._id), stage: 'en_route', patientPoint, hospitalPoint: hospital.location.coordinates, legFrom: from, legTo: patientPoint, legKm: distanceKm(from, patientPoint) * ROAD_FACTOR, progressKm: 0, stageTimes: { en_route: now }, dispatchedAt: now },
        },
      },
      { returnDocument: 'after' },
    ).lean()
    if (!claimed) throw fail(409, 'That ambulance was just taken')
    await EmergencyCase.updateOne(
      { _id: c._id },
      { $set: { ambulance: claimed._id, status: CASE_STATUS.AMBULANCE_ASSIGNED }, $push: { timeline: entry('ambulance_assigned', `Ambulance ${claimed.vehicleNumber} (${claimed.type}) dispatched`, { ambulance: String(claimed._id), type: claimed.type }, actor) } },
    )
    await this.emitStage(c, claimed, 'en_route')
    this.io?.to(patientRoom(c.patient)).emit(EV.AMBULANCE_ASSIGNED, this.payload(c, claimed))
    this.io?.to(hospitalRoom(hospitalId)).emit(EV.AMBULANCE_ASSIGNED, this.payload(c, claimed))
    return claimed
  }

  async release(ambulanceId, why) {
    const a = await Ambulance.findById(ambulanceId).lean()
    if (!a) return null
    const home = (await Hospital.findById(a.hospital).lean())?.location
    return Ambulance.findOneAndUpdate({ _id: a._id }, { $set: { status: 'available', ...(a.trip?.stage === 'at_hospital' && home && { position: home }) }, $unset: { trip: '' } }, { returnDocument: 'after' }).lean().then((r) => { this.logger.debug?.(`[ambulance] released ${a.vehicleNumber}: ${why}`); return r })
  }

  // ---- 75, 77: movement ------------------------------------------------------------------------
  payload(c, a) {
    const t = a.trip ?? {}
    const toGo = Math.max(0, (t.legKm ?? 0) - (t.progressKm ?? 0))
    const moving = MOVING.includes(t.stage)
    const afterLeg = t.stage === 'en_route' && t.patientPoint && t.hospitalPoint ? distanceKm(t.patientPoint, t.hospitalPoint) * ROAD_FACTOR : 0
    return {
      caseId: String(c._id ?? c.caseId ?? t.caseId),
      ambulanceId: String(a._id),
      vehicleNumber: a.vehicleNumber,
      type: a.type,
      stage: t.stage,
      stageLabel: TRIP_LABEL[t.stage],
      position: { lng: a.position.coordinates[0], lat: a.position.coordinates[1] },
      etaSeconds: moving ? Math.round((toGo / this.speedKmh) * 3600) : 0,
      etaToHospitalSeconds: Math.round(((toGo + (t.stage === 'en_route' ? afterLeg : 0)) / this.speedKmh) * 3600),
      remainingKm: Math.round(toGo * 10) / 10,
      at: new Date(this.now()).toISOString(),
      simulated: true,
    }
  }

  async emitStage(c, a, stage) {
    const p = { ...this.payload(c, a), stage, stageLabel: TRIP_LABEL[stage] }
    const caseDoc = c.patient ? c : await EmergencyCase.findById(p.caseId).lean()
    this.io?.to(patientRoom(caseDoc.patient)).emit(EV.AMBULANCE_STATUS, p)
    if (caseDoc.acceptedHospital) this.io?.to(hospitalRoom(caseDoc.acceptedHospital)).emit(EV.AMBULANCE_STATUS, p)
    this.io?.to(ADMIN_ROOM).emit(EV.AMBULANCE_STATUS, p)
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick().catch((e) => this.logger.error?.('[ambulance] tick failed', e.message)), this.tickMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
  }

  /** Moves every vehicle that is driving; stops one whose case was cancelled; marks arrival at the patient or hospital. */
  async tick(dtMs = this.tickMs) {
    const moving = await Ambulance.find({ 'trip.stage': { $in: MOVING } }).lean()
    for (const a of moving) {
      const c = await EmergencyCase.findById(a.trip.caseId).lean()
      if (!c || [CASE_STATUS.CANCELLED, CASE_STATUS.CLOSED].includes(c.status)) { await this.release(a._id, 'case ended'); continue }
      const step = (this.speedKmh * dtMs) / 3_600_000
      const progress = Math.min(a.trip.legKm, a.trip.progressKm + step)
      const arrived = progress >= a.trip.legKm
      const position = { type: 'Point', coordinates: lerpPoint(a.trip.legFrom, a.trip.legTo, a.trip.legKm ? progress / a.trip.legKm : 1) }
      const next = await Ambulance.findOneAndUpdate({ _id: a._id, 'trip.stage': a.trip.stage }, { $set: { position, 'trip.progressKm': progress } }, { returnDocument: 'after' }).lean()
      if (!next) continue
      this.io?.to(patientRoom(c.patient)).emit(EV.AMBULANCE_POSITION, this.payload(c, next))
      if (c.acceptedHospital) this.io?.to(hospitalRoom(c.acceptedHospital)).emit(EV.AMBULANCE_POSITION, this.payload(c, next))
      if (arrived) await this.advance(c._id, a.trip.stage === 'en_route' ? 'at_patient' : 'at_hospital', { role: 'system' }, { fromSimulation: true })
    }
  }

  // ---- 78, 79, 80: stages ----------------------------------------------------------------------
  /** Moves a trip to the next stage. The crew buttons and the simulator both come through here. */
  async advance(caseId, toStage, actor = {}, { fromSimulation = false } = {}) {
    const i = TRIP_STAGES.indexOf(toStage)
    if (i < 1) throw fail(400, `stage must be one of: ${TRIP_STAGES.slice(1).join(', ')}`)
    const from = TRIP_STAGES[i - 1]
    const a0 = await Ambulance.findOne({ 'trip.caseId': String(caseId) }).lean()
    if (!a0) throw fail(404, 'No ambulance is on this case')
    const now = new Date(this.now())
    const set = { 'trip.stage': toStage, [`trip.stageTimes.${toStage}`]: now }
    if (toStage === 'at_patient' && !fromSimulation) Object.assign(set, { position: { type: 'Point', coordinates: a0.trip.patientPoint }, 'trip.progressKm': a0.trip.legKm })
    if (toStage === 'at_patient') set.position = { type: 'Point', coordinates: a0.trip.patientPoint }
    if (toStage === 'en_route_to_hospital') Object.assign(set, { status: 'on_trip', 'trip.legFrom': a0.trip.patientPoint, 'trip.legTo': a0.trip.hospitalPoint, 'trip.legKm': distanceKm(a0.trip.patientPoint, a0.trip.hospitalPoint) * ROAD_FACTOR, 'trip.progressKm': 0 })
    if (toStage === 'patient_on_board') set.status = 'on_trip'
    if (toStage === 'at_hospital') set.position = { type: 'Point', coordinates: a0.trip.hospitalPoint }
    const a = await Ambulance.findOneAndUpdate({ _id: a0._id, 'trip.stage': from }, { $set: set }, { returnDocument: 'after' }).lean()
    if (!a) throw fail(409, `The trip is not at "${from}", so it cannot move to "${toStage}"`)

    const c0 = await EmergencyCase.findById(caseId).lean()
    const caseSet = toStage === 'patient_on_board' ? { status: CASE_STATUS.PATIENT_ON_BOARD } : {}
    const c = await EmergencyCase.findOneAndUpdate({ _id: caseId }, { $set: caseSet, $push: { timeline: entry('trip_stage', `${TRIP_LABEL[toStage]} (${a.vehicleNumber})`, { stage: toStage, ambulance: String(a._id) }, actor) } }, { returnDocument: 'after' }).lean()
    await this.emitStage(c ?? c0, a, toStage)
    if (toStage === 'patient_on_board' && c?.acceptedHospital) await updateHospitalCase({ hospitalId: c.acceptedHospital, emergencyCaseId: String(caseId) }, { status: 'accepted' }).catch(() => {})
    return a
  }

  /** Feature 80: the crew or the ED confirms arrival. Opens the hospital's arriving list, frees the vehicle. */
  async confirmArrival(caseId, actor = {}) {
    const a = await Ambulance.findOne({ 'trip.caseId': String(caseId), 'trip.stage': 'at_hospital' }).lean()
    if (!a) throw fail(409, 'The ambulance has not reached the hospital yet')
    const now = new Date(this.now())
    const c = await EmergencyCase.findOneAndUpdate(
      { _id: caseId, status: { $in: [CASE_STATUS.PATIENT_ON_BOARD, CASE_STATUS.AMBULANCE_ASSIGNED] } },
      { $set: { status: CASE_STATUS.ARRIVED }, $push: { timeline: entry('arrived', 'Patient arrived at the hospital', { ambulance: String(a._id) }, actor) } },
      { returnDocument: 'after' },
    ).lean()
    if (!c) throw fail(409, 'This case is not on its way to the hospital')
    await updateHospitalCase({ hospitalId: c.acceptedHospital, emergencyCaseId: String(caseId) }, { status: 'arrived', arrivedAt: now })
    await this.release(a._id, 'arrived')
    const p = { caseId: String(c._id), hospitalId: String(c.acceptedHospital), simulated: true, at: now.toISOString() }
    this.io?.to(patientRoom(c.patient)).emit(EV.ARRIVED, p)
    this.io?.to(hospitalRoom(c.acceptedHospital)).emit(EV.ARRIVED, p)
    return c
  }

  /** Both legs as drawable lines (feature 76). */
  routeFor(trip) {
    if (!trip?.patientPoint?.length) return null
    const first = trip.stage === 'en_route' ? trip.legFrom : trip.patientPoint
    return { toPatient: routeLine(first, trip.patientPoint), toHospital: routeLine(trip.patientPoint, trip.hospitalPoint), simulated: true }
  }

  async resume() {
    const n = await Ambulance.countDocuments({ 'trip.stage': { $in: MOVING } })
    if (n) this.logger.log?.(`[ambulance] resuming ${n} trip(s)`)
    this.start()
    return n
  }
}
