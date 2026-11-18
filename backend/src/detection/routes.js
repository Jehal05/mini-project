// REST endpoints for detection (features 36, 38, 40). Mounted under /api/detection.
//
//   GET  /rules                         the rule table (what fires at which level)
//   GET  /config                        defaults, overrides, effective thresholds, change log
//   PUT  /config                        { thresholds?, baselineLimits?, riskWeights? }   admin (guarded)
//   GET  /status                        live detection state of every monitored patient
//   GET  /patients/:id/status           live detection state: level, rules, risk gauge, case
//   PUT  /patients/:id/thresholds       { thresholds } per-patient overrides              doctor/admin (guarded)
//   GET  /patients/:id/detections       history, newest first. ?from=&to=&severity=&outcome=&page=&limit=
//
// :id is the Mongo _id or the readable code (HT-2026-0001).
// INTERIM access: the write routes use the same presenter-key guard as scenario switching.
// TODO(Jehal): config -> central_admin role; patient thresholds -> doctor role; history -> the patient, their doctors and hospital staff on a case.

import express from 'express'
import mongoose from 'mongoose'
import { Patient } from '../models/Patient.js'
import { DEFAULT_THRESHOLDS } from '../../../shared/vitals.js'
import { DEFAULT_BASELINE_LIMITS, DEFAULT_RISK_WEIGHTS, DETECTION_OUTCOME } from '../../../shared/detection.js'
import { SEVERITY } from '../../../shared/emergency.js'
import { describeRules } from './rules.js'

const allow = (_req, _res, next) => next()

const MAX_LIMIT = 100

/** Parse ?page= and ?limit= strictly. Returns { page, limit } or { error }. */
export function parsePaging(query) {
  const page = query.page === undefined ? 1 : Number(query.page)
  const limit = query.limit === undefined ? 20 : Number(query.limit)
  if (!Number.isInteger(page) || page < 1) return { error: 'page must be a whole number from 1' }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { error: `limit must be a whole number from 1 to ${MAX_LIMIT}` }
  return { page, limit }
}

function parseDate(value, name) {
  if (value === undefined) return { value: undefined }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? { error: `${name} must be an ISO date, e.g. 2026-11-18T08:00:00Z` } : { value: d }
}

export function createDetectionRouter(service, { guard = allow, presenterGuard = allow } = {}) {
  const router = express.Router()
  router.use(express.json())
  router.use(guard)

  async function resolvePatient(req, res, next) {
    try {
      const { id } = req.params
      const query = mongoose.isValidObjectId(id) ? { _id: id } : { patientCode: id.toUpperCase() }
      const patient = await Patient.findOne(query).lean()
      if (!patient) return res.status(404).json({ error: 'Patient not found' })
      req.patient = patient
      req.patientId = String(patient._id)
      next()
    } catch (err) {
      next(err)
    }
  }

  const actorOf = (req) => ({ role: req.user?.role ?? 'presenter', id: req.user?.id })

  router.get('/rules', (_req, res) => {
    res.json({ levels: SEVERITY, rules: describeRules(), simulated: true })
  })

  router.get('/config', (_req, res) => {
    res.json({
      ...service.getConfig(),
      defaults: { thresholds: DEFAULT_THRESHOLDS, baselineLimits: DEFAULT_BASELINE_LIMITS, riskWeights: DEFAULT_RISK_WEIGHTS },
    })
  })

  router.put('/config', presenterGuard, async (req, res, next) => {
    try {
      res.json(await service.updateConfig(req.body ?? {}, actorOf(req)))
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message, errors: err.errors })
      next(err)
    }
  })

  router.get('/status', (_req, res) => {
    res.json(service.statuses())
  })

  router.get('/patients/:id/status', resolvePatient, (req, res) => {
    const status = service.status(req.patientId)
    if (!status) return res.status(409).json({ error: 'Patient is not being monitored' })
    res.json(status)
  })

  router.put('/patients/:id/thresholds', presenterGuard, resolvePatient, async (req, res, next) => {
    try {
      const effective = await service.setPatientThresholds(req.patientId, req.body?.thresholds ?? {}, actorOf(req))
      res.json({ patientId: req.patientId, thresholds: effective.thresholds })
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message, errors: err.errors })
      next(err)
    }
  })

  router.get('/patients/:id/detections', resolvePatient, async (req, res, next) => {
    try {
      const paging = parsePaging(req.query)
      if (paging.error) return res.status(400).json({ error: paging.error })
      const from = parseDate(req.query.from, 'from')
      const to = parseDate(req.query.to, 'to')
      if (from.error || to.error) return res.status(400).json({ error: from.error ?? to.error })
      if (from.value && to.value && from.value > to.value) return res.status(400).json({ error: 'from must not be after to' })

      let severity
      if (req.query.severity !== undefined) {
        severity = Number(req.query.severity)
        if (![1, 2, 3].includes(severity)) return res.status(400).json({ error: 'severity must be 1, 2 or 3' })
      }
      const outcome = req.query.outcome
      if (outcome !== undefined && !Object.values(DETECTION_OUTCOME).includes(outcome)) {
        return res.status(400).json({ error: `outcome must be one of: ${Object.values(DETECTION_OUTCOME).join(', ')}` })
      }

      const { items, total } = await service.store.listDetections({
        patient: req.patientId,
        from: from.value,
        to: to.value,
        severity,
        outcome,
        ...paging,
      })
      res.json({
        page: paging.page,
        limit: paging.limit,
        total,
        pages: Math.max(1, Math.ceil(total / paging.limit)),
        simulated: true,
        items: items.map((d) => ({
          id: String(d._id),
          at: new Date(d.at).toISOString(),
          severity: d.severity,
          severityLabel: d.severityLabel,
          primaryRule: d.primaryRule,
          rules: d.rules,
          snapshot: d.snapshot,
          statuses: d.statuses instanceof Map ? Object.fromEntries(d.statuses) : d.statuses,
          scenario: d.scenario,
          riskScore: d.riskScore,
          riskLevel: d.riskLevel,
          riskBreakdown: d.riskBreakdown,
          outcome: d.outcome,
          case: d.case ? String(d.case) : null,
          episode: d.episode,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Internal error' })
    if (!err.status) console.error('[detection]', err)
  })

  return router
}
