// REST endpoints for the SOS flow. Mounted under /api/emergency.
//
//   POST /sos                       { patient, location? }      41  join the live case or open one
//   GET  /active?patient=           the patient's live case (restores the screen after a reload)
//   GET  /mine?patient=&page=&limit=                             50  incident history
//   GET  /first-aid?patient=                                     104 first aid + 112/108, aspirin rule
//   GET  /:caseId                                                one case with its full timeline
//   PUT  /:caseId/symptoms          { symptoms }                 43  saved while the countdown runs
//   POST /:caseId/confirm           { symptoms? }                43  send now
//   POST /:caseId/cancel            { reason, note? }            49
//   PUT  /:caseId/location          { lng, lat, accuracyM?, source?, address? }   46
//   POST /:caseId/ack               { recipientType, recipientId, name? }         48
//   GET  /status/:token             family status page data (the token is the credential)
//   POST /status/:token/seen        a contact taps "Seen"
//
// ACCESS (our sign-in): every route except the family-link ones needs a signed-in user (or dev mode). A patient reaches
// only their own patient and cases; doctors and hospital staff and the central admin reach any (same rule as monitoring).

import express from 'express'
import mongoose from 'mongoose'
import { Patient, EmergencyCase } from '../models/index.js'
import { buildFirstAid } from '../../../shared/firstaid.js'
import { EMERGENCY_NUMBERS } from '../../../shared/emergency.js'
import { httpError } from './service.js'
import { canAccess } from '../monitoring/auth.js'
import { emergencyRecord } from './patientRecord.js'

const allow = (_req, _res, next) => next()
const MAX_LIMIT = 50

function paging(query) {
  const page = query.page === undefined ? 1 : Number(query.page)
  const limit = query.limit === undefined ? 10 : Number(query.limit)
  if (!Number.isInteger(page) || page < 1) throw httpError(400, 'page must be a whole number from 1')
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw httpError(400, `limit must be a whole number from 1 to ${MAX_LIMIT}`)
  return { page, limit }
}

export function createEmergencyRouter(service, { guard = allow } = {}) {
  const router = express.Router()
  router.use(express.json())
  // Express 4 does not pass a rejected promise from an async handler on to the error handler, so every handler is wrapped.
  for (const method of ['get', 'post', 'put']) {
    const add = router[method].bind(router)
    router[method] = (path, ...fns) => add(path, ...fns.map((fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)))
  }

  // Family links: no login, the unguessable token in the link is the credential.
  router.get('/status/:token', async (req, res) => {
    const out = await service.publicStatus(req.params.token)
    return out ? res.json(out) : res.status(404).json({ error: 'This status link is not valid' })
  })
  router.post('/status/:token/seen', async (req, res) => {
    const out = await service.seenByToken(req.params.token)
    return out ? res.json(out) : res.status(404).json({ error: 'This status link is not valid' })
  })

  router.use(guard)

  async function patientOf(value) {
    if (typeof value !== 'string' || !value) throw httpError(400, 'patient (id or code such as HT-2026-0001) is required')
    const p = await Patient.findOne(mongoose.isValidObjectId(value) ? { _id: value } : { patientId: value.toUpperCase() }).lean()
    if (!p) throw httpError(404, 'Patient not found')
    return p
  }

  /** The patient the request is about, and a 403 unless this user may act for them. */
  const patientFor = async (req, value) => {
    const p = await patientOf(value)
    if (!canAccess(req, p)) throw httpError(403, 'You can only use the emergency screens for your own record')
    return p
  }

  /** A case id in the URL: 404 for a bad id, 403 unless this user may act on that patient. */
  const caseFor = async (req) => {
    const id = req.params.caseId
    if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Case not found')
    const c = await EmergencyCase.findById(id, { patient: 1 }).lean()
    if (!c) throw httpError(404, 'Case not found')
    if (!canAccess(req, { _id: c.patient })) throw httpError(403, 'You can only use the emergency screens for your own record')
  }

  router.post('/sos', async (req, res) => {
    const p = await patientFor(req, req.body?.patient)
    const out = await service.sos(p._id, { location: req.body?.location })
    res.status(out.created ? 201 : 200).json(out)
  })

  router.get('/active', async (req, res) => {
    const p = await patientFor(req, req.query.patient)
    res.json({ case: await service.active(p._id), serverNow: new Date(service.now()).toISOString(), numbers: EMERGENCY_NUMBERS, simulated: true })
  })

  router.get('/mine', async (req, res) => {
    const p = await patientFor(req, req.query.patient)
    res.json(await service.history(p._id, paging(req.query)))
  })

  router.get('/first-aid', async (req, res) => {
    const p = await patientFor(req, req.query.patient)
    const aid = buildFirstAid(emergencyRecord(p))
    res.json({ ...aid, numbers: EMERGENCY_NUMBERS })
  })

  router.get('/:caseId', async (req, res) => {
    await caseFor(req)
    const c = await service.get(req.params.caseId)
    return c ? res.json(c) : res.status(404).json({ error: 'Case not found' })
  })

  router.put('/:caseId/symptoms', async (req, res) => {
    await caseFor(req)
    const c = await service.recordSymptoms(req.params.caseId, req.body?.symptoms ?? {})
    res.json({ case: service.toView(c) })
  })

  router.post('/:caseId/confirm', async (req, res) => {
    await caseFor(req)
    const out = await service.confirm(req.params.caseId, req.body?.symptoms ?? {})
    if (!out.case) return res.status(404).json({ error: 'Case not found' })
    if (out.case.status === 'cancelled' || out.case.status === 'closed') return res.status(409).json({ error: `The case is already ${out.case.status}`, case: service.toView(out.case) })
    return res.json({ changed: out.changed, case: service.toView(out.case) })
  })

  router.post('/:caseId/cancel', async (req, res) => {
    await caseFor(req)
    const c = await service.cancel(req.params.caseId, { reason: req.body?.reason, note: req.body?.note, actor: { role: req.user?.role, id: req.user?.id ? String(req.user.id) : undefined } })
    res.json({ case: service.toView(c) })
  })

  router.put('/:caseId/location', async (req, res) => {
    await caseFor(req)
    const c = await service.updateLocation(req.params.caseId, req.body ?? {})
    res.json({ case: service.toView(c) })
  })

  router.post('/:caseId/ack', async (req, res) => {
    await caseFor(req)
    res.json(await service.acknowledge(req.params.caseId, req.body ?? {}))
  })

  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' })
    res.status(500).json({ error: 'Internal error' })
  })
  return router
}
