// REST endpoints for monitoring (features 26, 28, 30). Mounted under /api/sim by default.
//
//   GET  /scenarios                           list of scenarios for the presenter panel
//   GET  /patients                            monitored patients with their live snapshot
//   GET  /patients/:id                        one patient (id = Mongo _id or HT-YYYY-NNNN)
//   GET  /patients/:id/vitals/latest          live snapshot
//   GET  /patients/:id/vitals/history?range=1h|24h|7d
//   GET  /patients/:id/timeline?range=1h|24h|7d
//   POST /patients/:id/scenario  { scenario }  presenter control (guarded)

import express from 'express'
import mongoose from 'mongoose'
import { Patient } from '../models/Patient.js'
import { byCode, codeOf, conditionsOf, nameOf } from '../models/patientView.js'
import { SCENARIOS, SCENARIO_INFO } from './scenarios.js'
import { parseRange, vitalsHistory, healthTimeline } from './history.js'
import { patientTrends } from './trends.js'

const allow = (_req, _res, next) => next()

// presenterGuard defaults to allow here; attachSimulation() passes the PRESENTER_KEY guard (access.js).
// `access` (optional): { patient(req, patient) -> bool, visibleIds(req) -> ids | null }. Without it every caller may.
export function createSimulationRouter(engine, { guard = allow, presenterGuard = allow, access } = {}) {
  const router = express.Router()
  router.use(express.json())
  router.use(guard)

  // Accept either the Mongo id or the readable patient code.
  async function resolvePatient(req, res, next) {
    try {
      const { id } = req.params
      const query = mongoose.isValidObjectId(id) ? { _id: id } : byCode(id)
      const patient = await Patient.findOne(query).lean()
      if (!patient || (access?.patient && !(await access.patient(req, patient)))) return res.status(404).json({ error: 'Patient not found' })
      req.patient = patient
      req.patientId = String(patient._id)
      next()
    } catch (err) {
      next(err)
    }
  }

  const publicPatient = (p) => ({
    id: String(p._id),
    patientCode: codeOf(p),
    name: nameOf(p),
    bloodGroup: p.bloodGroup,
    city: p.city,
    dateOfBirth: p.dateOfBirth,
    cardiacConditions: p.cardiacConditions ?? [],
    conditions: conditionsOf(p) ?? [],
  })

  router.get('/scenarios', (_req, res) => {
    res.json(SCENARIOS.map((key) => ({ key, ...SCENARIO_INFO[key] })))
  })

  router.get('/patients', async (req, res, next) => {
    try {
      const visible = access?.visibleIds ? await access.visibleIds(req) : null
      const patients = await Patient.find(visible ? { _id: { $in: visible } } : {}).sort({ patientId: 1 }).lean()
      res.json(patients.map((p) => ({ ...publicPatient(p), live: engine.snapshot(String(p._id)) })))
    } catch (err) {
      next(err)
    }
  })

  router.get('/patients/:id', resolvePatient, (req, res) => {
    res.json({ ...publicPatient(req.patient), live: engine.snapshot(req.patientId) })
  })

  router.get('/patients/:id/vitals/latest', resolvePatient, (req, res) => {
    const snap = engine.snapshot(req.patientId)
    if (!snap) return res.status(409).json({ error: 'Patient is not being monitored' })
    res.json(snap)
  })

  router.get('/patients/:id/vitals/history', resolvePatient, async (req, res, next) => {
    try {
      const range = parseRange(req.query.range ?? '1h')
      if (!range) return res.status(400).json({ error: 'range must be 1h, 24h or 7d' })
      res.json({ range, simulated: true, points: await vitalsHistory(req.patientId, range, { thresholds: engine.thresholds }) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/patients/:id/timeline', resolvePatient, async (req, res, next) => {
    try {
      const range = parseRange(req.query.range ?? '24h')
      if (!range) return res.status(400).json({ error: 'range must be 1h, 24h or 7d' })
      res.json({ range, ...(await healthTimeline(req.patientId, range, { thresholds: engine.thresholds })) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/patients/:id/trends', resolvePatient, async (req, res, next) => {
    try {
      res.json(await patientTrends(req.patient, { thresholds: engine.thresholds }))
    } catch (err) {
      next(err)
    }
  })

  router.post('/patients/:id/scenario', presenterGuard, resolvePatient, async (req, res, next) => {
    try {
      const scenario = req.body?.scenario
      if (!SCENARIOS.includes(scenario)) {
        return res.status(400).json({ error: `scenario must be one of: ${SCENARIOS.join(', ')}` })
      }
      if (!engine.has(req.patientId)) await engine.addPatient(req.patient)
      const snap = await engine.setScenario(req.patientId, scenario, { actorRole: req.user?.role ?? 'presenter', actorId: req.user?.id })
      res.json(snap)
    } catch (err) {
      next(err)
    }
  })

   
  router.use((err, _req, res, _next) => {
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Internal error', code: err.code && err.status ? err.code : undefined })
    if (!err.status) console.error('[simulation]', err)
  })

  return router
}
