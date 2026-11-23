// Features 36, 39, 40 over HTTP and Socket.IO against a real MongoDB:
// the atomic one-case guard, the history list, the config API and the live events.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { attachSimulation, createPresenterKeyGuard } from '../src/simulation/index.js'
import { attachDetection } from '../src/detection/index.js'
import { mongoDetectionStore } from '../src/detection/store.js'
import { DetectionService } from '../src/detection/service.js'
import { seedPatients } from '../src/dev/seed.js'
import { seededRng } from '../src/simulation/engine.js'
import { Detection, DetectionConfig, EmergencyCase } from '../src/models/index.js'
import { HealthEvent } from '../src/models/HealthEvent.js'
import { ONE_ACTIVE_CASE_INDEX } from '../src/models/EmergencyCase.js'
import { CASE_STATUS } from '../../shared/emergency.js'
import { DETECTION_EVENTS } from '../../shared/detection.js'
import { startMongo } from './helpers/mongo.js'

const mongo = await startMongo('detection.api.test')
const KEY = 'test-key'
const silent = { warn() {}, error() {}, log() {} }

describe.skipIf(!mongo)('detection (MongoDB)', () => {
  let app
  let server
  let io
  let engine
  let detection
  let rahul
  let ananya
  let port
  let t = Date.now() - 60 * 60_000
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      t += 2000
      await engine.tick()
    }
    await detection.idle()
  }

  beforeAll(async () => {
    await mongoose.connect(mongo.getUri('detection-api'))
    await EmergencyCase.init() // build the partial unique index before any test relies on it
    const patients = await seedPatients()
    rahul = patients.find((p) => p.patientCode === 'HT-2026-0001')
    ananya = patients.find((p) => p.patientCode === 'HT-2026-0002')

    app = express()
    server = http.createServer(app)
    io = new Server(server)
    const presenterGuard = createPresenterKeyGuard({ env: { PRESENTER_KEY: KEY } })
    engine = await attachSimulation({ app, io, autoStart: false, logger: silent, presenterGuard, authorizeSubscribe: () => true, engineOptions: { rng: seededRng(21), now: () => t, saveEveryMs: 1e12 } })
    detection = await attachDetection({ app, io, engine, presenterGuard, logger: silent })
    await new Promise((r) => server.listen(0, r))
    port = server.address().port
  })

  afterAll(async () => {
    detection?.stop()
    engine?.stop()
    io?.close()
    server?.close()
    await mongoose.disconnect()
    await mongo.stop()
  })

  describe('feature 39: one live case per patient, enforced by the database', () => {
    const doc = (patient, extra = {}) => ({
      patient,
      patientCode: 'HT-TEST',
      source: 'auto_detection',
      severity: 3,
      status: CASE_STATUS.AWAITING_CONFIRMATION,
      detection: { rulesFired: [{ rule: 'multi:tachycardia-hypoxia', level: 3, message: 'x' }], snapshot: { hr: 135, spo2: 85 }, statuses: { hr: 'critical' }, riskScore: 70 },
      ...extra,
    })

    it('20 simultaneous attempts create exactly one case (a naive find-then-insert fails this)', async () => {
      const patient = new mongoose.Types.ObjectId()
      const results = await Promise.all(Array.from({ length: 20 }, () => mongoDetectionStore.createCaseIfNone(doc(patient))))
      expect(results.filter((r) => r.created)).toHaveLength(1)
      expect(new Set(results.map((r) => String(r.case._id))).size).toBe(1)
      expect(await EmergencyCase.countDocuments({ patient })).toBe(1)
    })

    it('the partial unique index exists and rejects a second live case written directly', async () => {
      const indexes = await EmergencyCase.collection.indexes()
      const idx = indexes.find((i) => i.name === ONE_ACTIVE_CASE_INDEX)
      expect(idx).toMatchObject({ unique: true, key: { patient: 1 } })
      const patient = new mongoose.Types.ObjectId()
      await EmergencyCase.create(doc(patient))
      await expect(EmergencyCase.create(doc(patient, { source: 'manual_sos' }))).rejects.toMatchObject({ code: 11000 })
    })

    it('a closed or cancelled case does not block a new one', async () => {
      const patient = new mongoose.Types.ObjectId()
      const a = await mongoDetectionStore.createCaseIfNone(doc(patient))
      await EmergencyCase.updateOne({ _id: a.case._id }, { status: CASE_STATUS.CLOSED })
      const b = await mongoDetectionStore.createCaseIfNone(doc(patient))
      expect(b.created).toBe(true)
      expect(String(b.case._id)).not.toBe(String(a.case._id))
      await EmergencyCase.updateOne({ _id: b.case._id }, { status: CASE_STATUS.CANCELLED, 'cancellation.reason': 'false_alarm' })
      expect((await mongoDetectionStore.createCaseIfNone(doc(patient))).created).toBe(true)
    })

    it('stores the detection snapshot, defaults and timestamps on the new case', async () => {
      const patient = new mongoose.Types.ObjectId()
      const { case: c } = await mongoDetectionStore.createCaseIfNone(doc(patient))
      const saved = await EmergencyCase.findById(c._id).lean()
      expect(saved).toMatchObject({ source: 'auto_detection', severity: 3, status: 'awaiting_confirmation', simulated: true })
      expect(saved.detection.snapshot).toMatchObject({ hr: 135, spo2: 85 })
      expect(saved.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('a cardiac event, end to end', () => {
    it('opens one case, saves the detections, and writes timeline events', async () => {
      await tick(30)
      await engine.setScenario(String(rahul._id), 'cardiac_event')
      await tick(60)

      const cases = await EmergencyCase.find({ patient: rahul._id, source: 'auto_detection' }).lean()
      expect(cases).toHaveLength(1)
      expect(cases[0].detection.rulesFired[0].rule).toMatch(/^multi:/)
      expect(cases[0].detection.snapshot.hr).toBeGreaterThan(110)
      expect(cases[0].escalation.confirmDeadline).toBeInstanceOf(Date)

      const detections = await Detection.find({ patient: rahul._id }).sort({ at: 1 }).lean()
      expect(detections.at(-1)).toMatchObject({ severity: 3, outcome: 'case_created' })
      expect(String(detections.at(-1).case)).toBe(String(cases[0]._id))
      expect(String(cases[0].detectionRef)).toBe(String(detections.at(-1)._id))
      expect(detections.at(-1).statuses.hr).toBe('critical') // Map stored as a plain object

      const events = await HealthEvent.find({ patient: rahul._id, type: 'detection' }).lean()
      expect(events.length).toBe(detections.length)

      const other = await EmergencyCase.countDocuments({ patient: ananya._id })
      expect(other).toBe(0) // the stable patient is untouched
    })

    it('the health timeline now includes the detection events (feature 30)', async () => {
      const res = await request(app).get('/api/sim/patients/HT-2026-0001/timeline?range=24h').expect(200)
      expect(res.body.events.some((e) => e.type === 'detection' && /Level 3/.test(e.message))).toBe(true)
    })

    it('does not open a second case when the engine restarts mid-emergency', async () => {
      const store = mongoDetectionStore
      const fresh = new DetectionService({ engine, store, logger: silent, now: () => t })
      await fresh.init()
      fresh.start()
      await tick(10)
      await fresh.idle()
      fresh.stop()
      expect(await EmergencyCase.countDocuments({ patient: rahul._id, source: 'auto_detection' })).toBe(1)
    })
  })

  describe('GET /api/detection/patients/:id/status', () => {
    it('returns level, reasons, risk gauge and the case', async () => {
      const res = await request(app).get('/api/detection/patients/HT-2026-0001/status').expect(200)
      expect(res.body).toMatchObject({ level: 3, simulated: true, severity: { label: 'Level 3 Critical cardiac' } })
      expect(res.body.primary.rule).toMatch(/^multi:/)
      expect(res.body.risk).toMatchObject({ level: 'high' })
      expect(res.body.risk.breakdown.length).toBeGreaterThan(2)
      expect(res.body.case).toMatchObject({ id: expect.any(String) })
    })

    it('GET /status lists every monitored patient', async () => {
      const res = await request(app).get('/api/detection/status').expect(200)
      expect(res.body.map((s) => s.patientCode).sort()).toEqual(['HT-2026-0001', 'HT-2026-0002', 'HT-2026-0003'])
      expect(res.body.find((s) => s.patientCode === 'HT-2026-0001').level).toBe(3)
    })

    it('shows Level 0 for the stable patient and 404 for an unknown one', async () => {
      const res = await request(app).get(`/api/detection/patients/${ananya._id}/status`).expect(200)
      expect(res.body.level).toBe(0)
      await request(app).get('/api/detection/patients/HT-2026-9999/status').expect(404)
    })
  })

  describe('feature 40: GET /api/detection/patients/:id/detections', () => {
    const url = '/api/detection/patients/HT-2026-0001/detections'

    it('lists newest first with a snapshot, the rules and the outcome', async () => {
      const res = await request(app).get(url).expect(200)
      expect(res.body).toMatchObject({ page: 1, limit: 20, simulated: true })
      expect(res.body.total).toBeGreaterThanOrEqual(2)
      const ats = res.body.items.map((i) => i.at)
      expect(ats).toEqual([...ats].sort().reverse())
      const top = res.body.items[0]
      expect(top).toMatchObject({ severity: 3, outcome: 'case_created', riskLevel: 'high' })
      expect(top.snapshot.hr).toBeGreaterThan(110)
      expect(top.rules[0].message).toMatch(/Heart rate/)
    })

    it('paginates', async () => {
      const all = await request(app).get(`${url}?limit=100`).expect(200)
      const total = all.body.total
      const p1 = await request(app).get(`${url}?limit=2&page=1`).expect(200)
      const p2 = await request(app).get(`${url}?limit=2&page=2`).expect(200)
      expect(p1.body).toMatchObject({ page: 1, limit: 2, total, pages: Math.ceil(total / 2) })
      expect(p1.body.items).toHaveLength(2)
      expect(p2.body.items[0].id).toBe(all.body.items[2].id)
      const past = await request(app).get(`${url}?limit=2&page=99`).expect(200)
      expect(past.body.items).toEqual([])
    })

    it('filters by severity and outcome', async () => {
      const s3 = await request(app).get(`${url}?severity=3`).expect(200)
      expect(s3.body.items.length).toBeGreaterThan(0)
      expect(s3.body.items.every((i) => i.severity === 3)).toBe(true)
      const done = await request(app).get(`${url}?outcome=cancelled`).expect(200)
      expect(done.body.total).toBe(0)
    })

    it('filters by time range', async () => {
      const all = await request(app).get(`${url}?limit=100`).expect(200)
      const oldest = all.body.items.at(-1)
      const newest = all.body.items[0]
      const after = await request(app).get(`${url}?from=${encodeURIComponent(newest.at)}`).expect(200)
      expect(after.body.items.every((i) => i.at >= newest.at)).toBe(true)
      const before = await request(app).get(`${url}?to=${encodeURIComponent(oldest.at)}`).expect(200)
      expect(before.body.items.every((i) => i.at <= oldest.at)).toBe(true)
      const none = await request(app).get(`${url}?from=2000-01-01&to=2000-01-02`).expect(200)
      expect(none.body.total).toBe(0)
    })

    it('rejects bad parameters with a reason', async () => {
      const bad = ['page=0', 'page=abc', 'limit=0', 'limit=101', 'limit=1.5', 'severity=4', 'severity=x', 'outcome=maybe', 'from=yesterday', 'to=nope', 'from=2026-12-01&to=2026-01-01']
      for (const q of bad) {
        const res = await request(app).get(`${url}?${q}`)
        expect(res.status, q).toBe(400)
        expect(res.body.error).toEqual(expect.any(String))
      }
    })

    it('only shows that patient\'s detections', async () => {
      const res = await request(app).get(`/api/detection/patients/${ananya._id}/detections`).expect(200)
      expect(res.body.total).toBe(0)
    })
  })

  describe('feature 36: configuration API', () => {
    it('GET /rules describes the rule table and the three levels', async () => {
      const res = await request(app).get('/api/detection/rules').expect(200)
      expect(res.body.levels['3'].label).toBe('Level 3 Critical cardiac')
      expect(res.body.rules.some((r) => r.id === 'multi:tachycardia-hypoxia' && r.level === 3)).toBe(true)
    })

    it('GET /config returns defaults, overrides and the effective thresholds', async () => {
      const res = await request(app).get('/api/detection/config').expect(200)
      expect(res.body.defaults.thresholds.hr.normal).toEqual([60, 100])
      expect(res.body.effective.thresholds.hr.normal).toEqual([60, 100])
      expect(res.body).toMatchObject({ persistenceTicks: 3 })
    })

    it('PUT /config needs the presenter key (interim guard)', async () => {
      const body = { thresholds: { hr: { normal: [55, 100] } } }
      const res = await request(app).put('/api/detection/config').send(body).expect(401)
      expect(res.body.code).toBe('PRESENTER_KEY_REQUIRED')
      await request(app).put('/api/detection/config').set('x-presenter-key', 'wrong').send(body).expect(401)
    })

    it('PUT /config validates and returns every reason', async () => {
      const res = await request(app)
        .put('/api/detection/config')
        .set('x-presenter-key', KEY)
        .send({ thresholds: { hr: { normal: [100, 60] }, pulse: {} } })
        .expect(400)
      expect(res.body.errors.length).toBe(2)
    })

    it('PUT /config saves, applies at once, persists, and logs the change', async () => {
      const res = await request(app).put('/api/detection/config').set('x-presenter-key', KEY).send({ thresholds: { temp: { normal: [36.1, 37.2] } } }).expect(200)
      expect(res.body.effective.thresholds.temp.normal).toEqual([36.1, 37.2])
      expect(engine.thresholds.temp.normal).toEqual([36.1, 37.2]) // live engine, no restart
      const stored = await DetectionConfig.findOne({ key: 'global' }).lean()
      expect(stored.thresholds.temp.normal).toEqual([36.1, 37.2])
      expect(stored.changes.at(-1)).toMatchObject({ scope: 'global', actorRole: 'presenter' })

      // a "restart": a new service loads the saved overrides
      const again = new DetectionService({ engine, store: mongoDetectionStore, logger: silent })
      await again.init()
      expect(again.getConfig().effective.thresholds.temp.normal).toEqual([36.1, 37.2])

      await request(app).put('/api/detection/config').set('x-presenter-key', KEY).send({ thresholds: {} }).expect(200) // reset
      expect(engine.thresholds.temp.normal).toEqual([36.1, 37.5])
    })

    it('PUT /patients/:id/thresholds sets one patient\'s overrides only', async () => {
      const res = await request(app)
        .put('/api/detection/patients/HT-2026-0002/thresholds')
        .set('x-presenter-key', KEY)
        .send({ thresholds: { hr: { normal: [50, 90], critical: { below: 40, above: 130 } } } })
        .expect(200)
      expect(res.body.thresholds.hr.normal).toEqual([50, 90])
      expect(engine.patients.get(String(ananya._id)).thresholds.hr.normal).toEqual([50, 90])
      expect(engine.patients.get(String(rahul._id)).thresholds).toBeNull()
      await request(app).put('/api/detection/patients/HT-2026-0002/thresholds').send({ thresholds: {} }).expect(401)
      await request(app).put('/api/detection/patients/HT-2026-0002/thresholds').set('x-presenter-key', KEY).send({}).expect(200) // remove
      expect(engine.patients.get(String(ananya._id)).thresholds).toBeNull()
      await request(app).put('/api/detection/patients/HT-2026-9999/thresholds').set('x-presenter-key', KEY).send({}).expect(404)
    })
  })

  describe('live events', () => {
    it('sends detection:update and emergency:created to a subscribed client, once each', async () => {
      // recover first so the next emergency is a fresh one
      await EmergencyCase.updateMany({ patient: ananya._id }, { status: CASE_STATUS.CLOSED })
      const client = ioClient(`http://localhost:${port}`, { transports: ['websocket'] })
      const updates = []
      const created = []
      try {
        const ack = await new Promise((resolve) => client.emit('vitals:subscribe', { patientId: String(ananya._id) }, resolve))
        expect(ack.ok).toBe(true)
        client.on(DETECTION_EVENTS.UPDATE, (p) => updates.push(p))
        client.on(DETECTION_EVENTS.CASE_CREATED, (p) => created.push(p))
        await tick(5)
        await engine.setScenario(String(ananya._id), 'cardiac_event')
        await tick(60)
        await new Promise((r) => setTimeout(r, 150))
        expect(updates.length).toBeGreaterThan(2)
        expect(updates.at(-1)).toMatchObject({ level: 3, patientCode: 'HT-2026-0002', simulated: true })
        expect(created).toHaveLength(1)
        expect(created[0]).toMatchObject({ severity: 3, patientCode: 'HT-2026-0002', status: 'awaiting_confirmation' })
        expect(await EmergencyCase.countDocuments({ patient: ananya._id, status: 'awaiting_confirmation' })).toBe(1)
      } finally {
        client.close()
      }
    })

    it('does not send Rahul\'s detections to a client following someone else', async () => {
      const client = ioClient(`http://localhost:${port}`, { transports: ['websocket'] })
      const seen = []
      try {
        const vik = await seedPatients().then((p) => p.find((x) => x.patientCode === 'HT-2026-0003'))
        await new Promise((resolve) => client.emit('vitals:subscribe', { patientId: String(vik._id) }, resolve))
        client.on(DETECTION_EVENTS.UPDATE, (p) => seen.push(p.patientCode))
        await tick(10)
        await new Promise((r) => setTimeout(r, 100))
        expect(seen.every((c) => c === 'HT-2026-0003')).toBe(true)
      } finally {
        client.close()
      }
    })
  })
})
