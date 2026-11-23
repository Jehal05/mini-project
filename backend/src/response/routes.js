// REST for the hospital response flow. Mounted by monitoring.js under /api.
//
//   GET  /hospitals/nearby?lng=&lat=&radiusKm=&cardiac=1&q=        53-59  any signed-in user
//   GET  /response/track/:caseId                                   67, 70, 76, 77  the patient, the hospital on the case, admins
//   GET  /response/incoming                                        62, 95  hospital: the live queue, most urgent first
//   GET  /response/cases/:id                                       63, 64  hospital that was told: case + handover (logged)
//   POST /response/cases/:id/accept                                65
//   POST /response/cases/:id/reject          { reason, note? }     66
//   POST /response/cases/:id/doctor          { doctorId }          68
//   PUT  /response/cases/:id/preparation     { edBayReady?, ... }  69
//   POST /response/cases/:id/ambulance       { ambulanceId? }      73 (assign or override)
//   POST /response/cases/:id/trip            { stage }             78, 79 (crew buttons)
//   POST /response/cases/:id/arrival                               80
//   GET/POST /response/ambulances, PATCH /response/ambulances/:id  71, 72

import express from 'express'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/authenticate.js'
import { protect, authorize } from '../middleware/authorize.js'
import { EmergencyCase } from '../models/EmergencyCase.js'
import { AMBULANCE_TYPES } from '../../../shared/response.js'

const ROLES = ['doctor', 'hospital_staff', 'hospital_admin']
const fail = (status, message) => Object.assign(new Error(message), { status })
const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined)

export function createResponseRouter({ service, ambulances, discovery, access }) {
  const router = express.Router()
  router.use(express.json())
  const crew = authorize('hospital_staff', 'hospital_admin')

  router.get('/hospitals/nearby', authenticate, async (req, res) => {
    const num = (v) => (v === undefined || v === '' ? undefined : Number(v))
    const radiusKm = Math.min(50, Math.max(1, num(req.query.radiusKm) ?? 30))
    const list = await discovery.nearby({ lng: num(req.query.lng), lat: num(req.query.lat), radiusKm, cardiacOnly: req.query.cardiac === '1' || req.query.cardiac === 'true', q: text(req.query.q, 80) })
    res.json({ items: list, radiusKm, simulated: true })
  })

  router.get('/response/track/:caseId', authenticate, async (req, res) => {
    const c = mongoose.isValidObjectId(req.params.caseId) ? await EmergencyCase.findById(req.params.caseId).lean() : null
    if (!c || (access?.case && !(await access.case(req, c, { write: false })))) throw fail(404, 'Case not found')
    res.json(await service.track(req.params.caseId))
  })

  const hospital = express.Router()
  hospital.use(protect({ roles: ROLES, hospitalScoped: true }))
  const own = (req) => req.hospitalId
  const actor = (req) => ({ id: req.user.id, role: req.user.role })
  // A crew action only on a case this hospital accepted.
  const myCase = async (req) => {
    const c = mongoose.isValidObjectId(req.params.id) ? await EmergencyCase.findById(req.params.id).lean() : null
    if (!c || String(c.acceptedHospital) !== String(own(req))) throw fail(404, 'Case not found')
    return c
  }

  hospital.get('/incoming', async (req, res) => res.json({ items: await service.incoming(own(req)), serverNow: new Date().toISOString(), simulated: true }))
  hospital.get('/cases/:id', async (req, res) => res.json(await service.caseForHospital(req.params.id, own(req), req)))
  hospital.post('/cases/:id/accept', async (req, res) => res.json(await service.accept(req.params.id, own(req), req.user, req)))
  hospital.post('/cases/:id/reject', async (req, res) => res.json(await service.reject(req.params.id, own(req), req.user, req.body, req)))
  hospital.post('/cases/:id/doctor', async (req, res) => res.json(await service.assignDoctor(req.params.id, own(req), req.body?.doctorId, req.user)))
  hospital.put('/cases/:id/preparation', async (req, res) => res.json(await service.setPreparation(req.params.id, own(req), req.body, req.user)))
  hospital.post('/cases/:id/ambulance', crew, async (req, res) => {
    const a = await ambulances.assign(req.params.id, own(req), { ambulanceId: req.body?.ambulanceId, actor: actor(req) })
    res.status(a ? 200 : 409).json(a ? { ambulance: a } : { error: { code: 'NO_AMBULANCE', message: 'No ambulance is free. Assign one by hand or call 108.' } })
  })
  hospital.post('/cases/:id/trip', crew, async (req, res) => {
    await myCase(req)
    res.json({ ambulance: await ambulances.advance(req.params.id, req.body?.stage, actor(req)) })
  })
  hospital.post('/cases/:id/arrival', crew, async (req, res) => {
    await myCase(req)
    res.json({ case: await ambulances.confirmArrival(req.params.id, actor(req)) })
  })

  hospital.get('/ambulances', async (req, res) => res.json({ items: await ambulances.list(own(req)), counts: await ambulances.counts(own(req)) }))
  hospital.post('/ambulances', crew, async (req, res) => {
    const b = req.body ?? {}
    const vehicleNumber = text(b.vehicleNumber, 20)
    if (!vehicleNumber) throw fail(400, 'vehicleNumber is required')
    if (b.type !== undefined && !AMBULANCE_TYPES.includes(b.type)) throw fail(400, `type must be one of: ${AMBULANCE_TYPES.join(', ')}`)
    const crewList = Array.isArray(b.crew) ? b.crew.slice(0, 6).map((m) => ({ name: text(m?.name, 80), role: text(m?.role, 40), phone: text(m?.phone, 20) })).filter((m) => m.name) : []
    const equipment = Array.isArray(b.equipment) ? b.equipment.slice(0, 20).map((e) => text(e, 60)).filter(Boolean) : []
    res.status(201).json(await ambulances.register(own(req), { vehicleNumber, type: b.type ?? 'BLS', crew: crewList, equipment }))
  })
  hospital.patch('/ambulances/:id', crew, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Ambulance not found')
    res.json(await ambulances.setStatus(own(req), req.params.id, req.body?.status))
  })
  router.use('/response', hospital)

  // Errors thrown here carry a status; send them in the same shape as the rest of the API.
  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, next) => {
    if (err?.status && !err.expose && err.name !== 'ApiError') return res.status(err.status).json({ error: { code: err.code ?? (err.status === 404 ? 'NOT_FOUND' : 'ERROR'), message: err.message } })
    return next(err)
  })
  return router
}
