// REST endpoints for the SOS flow. Mounted under /api/emergency.
//
//   POST /sos                       { patient, location? }      41  join the live case or open one
//   GET  /unresolved                central admin: cases nobody accepted after every round
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
// Access: `guard` and `access` come from the host (backend/src/access/monitoringAccess.js): patients reach only their own cases, hospital roles only cases they accepted; the token routes stay public by design. `adminGuard` protects GET /unresolved.

import express from 'express'
import mongoose from 'mongoose'
import { Patient } from '../models/Patient.js'
import { byCode, toTwinRecord } from '../models/patientView.js'
import { buildFirstAid } from '../../../shared/firstaid.js'
import { EMERGENCY_NUMBERS } from '../../../shared/emergency.js'
import { httpError } from './service.js'

const allow = (_req, _res, next) => next()
const MAX_LIMIT = 50

function paging(query) {
  const page = query.page === undefined ? 1 : Number(query.page)
  const limit = query.limit === undefined ? 10 : Number(query.limit)
  if (!Number.isInteger(page) || page < 1) throw httpError(400, 'page must be a whole number from 1')
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw httpError(400, `limit must be a whole number from 1 to ${MAX_LIMIT}`)
  return { page, limit }
}

// `access` (optional) decides who may touch which patient or case; without it every caller may (the old demo mode):
//   access.patient(req, patient, { write })  patient: a Patient record
//   access.case(req, emergencyCase, { write })
// A caller who may not see something gets the same 404 as for something that does not exist.
const WRITE_ROUTES = new Set(['symptoms', 'confirm', 'location'])

export function createEmergencyRouter(service, { guard = allow, adminGuard = allow, access } = {}) {
  const router = express.Router()
  router.use(express.json())

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

  async function patientOf(value, req, opts) {
    // A signed-in patient is always themself: the id comes from the token, not from the request.
    const given = req?.user?.role === 'patient' && req.user.patientId ? String(req.user.patientId) : value
    if (typeof given !== 'string' || !given) throw httpError(400, 'patient (id or code such as HT-2026-0001) is required')
    const p = await Patient.findOne(mongoose.isValidObjectId(given) ? { _id: given } : byCode(given)).lean()
    if (!p || (access?.patient && !(await access.patient(req, p, opts)))) throw httpError(404, 'Patient not found')
    return p
  }

  // Every route with :caseId first checks the caller may see that case.
  router.param('caseId', async (req, _res, next, caseId) => {
    try {
      if (!access?.case) return next()
      const write = WRITE_ROUTES.has(req.path.split('/')[2])
      const c = mongoose.isValidObjectId(caseId) ? await service.find(caseId) : null
      if (!c || !(await access.case(req, c, { write }))) throw httpError(404, 'Case not found')
      return next()
    } catch (err) {
      return next(err)
    }
  })

  router.post('/sos', async (req, res) => {
    const p = await patientOf(req.body?.patient, req, { write: true })
    const out = await service.sos(p._id, { location: req.body?.location })
    res.status(out.created ? 201 : 200).json(out)
  })

  router.get('/unresolved', adminGuard, async (_req, res) => {
    res.json({ items: await service.unresolved(), serverNow: new Date(service.now()).toISOString(), simulated: true })
  })

  router.get('/active', async (req, res) => {
    const p = await patientOf(req.query.patient, req)
    res.json({ case: await service.active(p._id), serverNow: new Date(service.now()).toISOString(), numbers: EMERGENCY_NUMBERS, simulated: true })
  })

  router.get('/mine', async (req, res) => {
    const p = await patientOf(req.query.patient, req)
    res.json(await service.history(p._id, paging(req.query)))
  })

  router.get('/first-aid', async (req, res) => {
    const p = await patientOf(req.query.patient, req)
    const aid = buildFirstAid(toTwinRecord(p))
    res.json({ ...aid, numbers: EMERGENCY_NUMBERS })
  })

  router.get('/:caseId', async (req, res) => {
    const c = await service.get(req.params.caseId)
    return c ? res.json(c) : res.status(404).json({ error: 'Case not found' })
  })

  router.put('/:caseId/symptoms', async (req, res) => {
    const c = await service.recordSymptoms(req.params.caseId, req.body?.symptoms ?? {})
    res.json({ case: service.toView(c) })
  })

  router.post('/:caseId/confirm', async (req, res) => {
    const out = await service.confirm(req.params.caseId, req.body?.symptoms ?? {})
    if (!out.case) return res.status(404).json({ error: 'Case not found' })
    if (out.case.status === 'cancelled' || out.case.status === 'closed') return res.status(409).json({ error: `The case is already ${out.case.status}`, case: service.toView(out.case) })
    return res.json({ changed: out.changed, case: service.toView(out.case) })
  })

  router.post('/:caseId/cancel', async (req, res) => {
    const c = await service.cancel(req.params.caseId, { reason: req.body?.reason, note: req.body?.note, actor: { role: req.user?.role, id: req.user?.id } })
    res.json({ case: service.toView(c) })
  })

  router.put('/:caseId/location', async (req, res) => {
    const c = await service.updateLocation(req.params.caseId, req.body ?? {})
    res.json({ case: service.toView(c) })
  })

  router.post('/:caseId/ack', async (req, res) => {
    res.json(await service.acknowledge(req.params.caseId, req.body ?? {}))
  })

   
  router.use((err, _req, res, _next) => {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' })
    res.status(500).json({ error: 'Internal error' })
  })
  return router
}
