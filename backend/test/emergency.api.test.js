// Phase 7 over HTTP and Socket.IO, with the real simulation and detection engines on a real MongoDB:
// a cardiac event opens a case, the patient confirms or cancels through the API, and the browser's
// socket hears each step.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { attachSimulation } from '../src/simulation/index.js'
import { attachDetection } from '../src/detection/index.js'
import { attachEmergency } from '../src/emergency/index.js'
import { seedPatients } from '../src/dev/seed.js'
import { seededRng } from '../src/simulation/engine.js'
import { Detection, EmergencyCase } from '../src/models/index.js'
import { EMERGENCY_EVENTS as EV } from '../../shared/emergency.js'
import { startMongo } from './helpers/mongo.js'

const mongo = await startMongo('emergency.api.test')
const silent = { warn() {}, error() {}, log() {} }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!mongo)('emergency API (MongoDB + Socket.IO)', () => {
  let app
  let server
  let io
  let engine
  let detection
  let emergency
  let discovery
  let rahul
  let ananya
  let vikram
  let socket
  let port
  const events = []
  let t = Date.now() - 60 * 60_000
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      t += 2000
      await engine.tick()
    }
    await detection.idle()
  }
  const heard = (name) => events.filter((e) => e.name === name)

  beforeAll(async () => {
    await mongoose.connect(mongo.getUri('emergency-api'))
    await EmergencyCase.init()
    const patients = await seedPatients()
    ;[rahul, ananya, vikram] = ['HT-2026-0001', 'HT-2026-0002', 'HT-2026-0003'].map((c) => patients.find((p) => p.patientCode === c))
    app = express()
    server = http.createServer(app)
    io = new Server(server)
    engine = await attachSimulation({ app, io, autoStart: false, logger: silent, authorizeSubscribe: () => true, engineOptions: { rng: seededRng(33), now: () => t, saveEveryMs: 1e12 } })
    detection = await attachDetection({ app, io, engine, logger: silent })
    discovery = { notify: vi.fn().mockResolvedValue([]) }
    emergency = await attachEmergency({ app, io, detection, discovery, logger: silent, publicUrl: 'https://demo.test' })
    await new Promise((r) => server.listen(0, r))
    port = server.address().port
    socket = ioClient(`http://localhost:${port}`, { transports: ['websocket'] })
    await new Promise((r) => socket.on('connect', r))
    for (const name of Object.values(EV)) socket.on(name, (payload) => events.push({ name, payload }))
    await new Promise((r) => socket.emit('vitals:subscribe', { patientId: String(rahul._id) }, r))
    await new Promise((r) => socket.emit('vitals:subscribe', { patientId: String(ananya._id) }, r))
  })

  afterAll(async () => {
    socket?.close()
    emergency?.stop()
    detection?.stop()
    engine?.stop()
    io?.close()
    server?.close()
    await mongoose.disconnect()
    await mongo.stop()
  })

  describe('a cardiac event through the whole flow', () => {
    let caseId

    it('detection opens a case, the countdown is armed on the server, and the screen can read it back', async () => {
      await tick(30)
      await engine.setScenario(String(rahul._id), 'cardiac_event')
      await tick(60)
      await wait(150)
      const created = heard(EV.CREATED).at(-1)
      expect(created.payload).toMatchObject({ patientCode: 'HT-2026-0001', status: 'awaiting_confirmation' })
      caseId = created.payload.caseId
      expect(emergency.timers.has(caseId)).toBe(true) // armed by attachEmergency from onCaseCreated

      const res = await request(app).get('/api/emergency/active').query({ patient: 'HT-2026-0001' }).expect(200)
      expect(res.body.case).toMatchObject({ id: caseId, status: 'awaiting_confirmation', isLive: true, simulated: true })
      expect(new Date(res.body.case.escalation.confirmDeadline).getTime()).toBeGreaterThan(Date.now() - 1000)
      expect(res.body.case.escalation.round).toBe(0)
      expect(res.body.serverNow).toBeTruthy()
      expect(res.body.numbers.map((n) => n.number)).toEqual(['112', '108'])
      expect(discovery.notify).not.toHaveBeenCalled() // nobody is notified before the countdown ends
    })

    it('symptoms can be saved while the countdown runs', async () => {
      const res = await request(app).put(`/api/emergency/${caseId}/symptoms`).send({ symptoms: { chestPain: true } }).expect(200)
      expect(res.body.case.symptoms).toMatchObject({ chestPain: true })
      expect(res.body.case.status).toBe('awaiting_confirmation')
      await request(app).put(`/api/emergency/${caseId}/symptoms`).send({ symptoms: { headache: true } }).expect(400)
    })

    it('confirm sends it: searching, the socket hears emergency:sent, discovery is told, Detection becomes "sent"', async () => {
      const res = await request(app).post(`/api/emergency/${caseId}/confirm`).send({ symptoms: { chestPain: true, shortnessOfBreath: true } }).expect(200)
      expect(res.body).toMatchObject({ changed: true, case: { status: 'searching', escalation: { round: 1, radiusKm: 10 } } })
      await wait(150)
      expect(heard(EV.CONFIRMED)).toHaveLength(1)
      expect(heard(EV.SENT).at(-1).payload).toMatchObject({ caseId, how: 'manual', round: 1, radiusKm: 10, simulated: true })
      expect(discovery.notify).toHaveBeenCalledTimes(1)
      const c = await EmergencyCase.findById(caseId).lean()
      expect((await Detection.findById(c.detectionRef)).outcome).toBe('sent')
      expect(c.symptoms).toMatchObject({ chestPain: true, shortnessOfBreath: true, noResponse: false })
      // confirming again is harmless
      const again = await request(app).post(`/api/emergency/${caseId}/confirm`).send({}).expect(200)
      expect(again.body.changed).toBe(false)
      expect(discovery.notify).toHaveBeenCalledTimes(1)
    })

    it('SOS now joins this case and returns it (no second case)', async () => {
      const res = await request(app).post('/api/emergency/sos').send({ patient: 'HT-2026-0001' }).expect(200)
      expect(res.body).toMatchObject({ created: false, joined: true, case: { id: caseId } })
      expect(await EmergencyCase.countDocuments({ patient: rahul._id })).toBe(1)
    })

    it('location updates reach the socket', async () => {
      const res = await request(app).put(`/api/emergency/${caseId}/location`).send({ lng: 73.8567, lat: 18.5204, accuracyM: 40, source: 'gps' }).expect(200)
      expect(res.body.case.location).toMatchObject({ accuracyM: 40, source: 'gps' })
      await wait(100)
      expect(heard(EV.LOCATION).at(-1).payload.location.point.coordinates).toEqual([73.8567, 18.5204])
      await request(app).put(`/api/emergency/${caseId}/location`).send({ lng: 500, lat: 18 }).expect(400)
    })

    it('"Seen" is recorded and announced once', async () => {
      const body = { recipientType: 'patient', recipientId: String(rahul._id), name: 'Rahul' }
      expect((await request(app).post(`/api/emergency/${caseId}/ack`).send(body).expect(200)).body.recorded).toBe(true)
      expect((await request(app).post(`/api/emergency/${caseId}/ack`).send(body).expect(200)).body.recorded).toBe(false)
      await request(app).post(`/api/emergency/${caseId}/ack`).send({ recipientType: 'nobody', recipientId: 'x' }).expect(400)
    })

    it('Rahul has an emergency contact: it was alerted with a wa.me link, and the family page works with no login', async () => {
      const c = await EmergencyCase.findById(caseId).lean()
      expect(c.contactAlerts).toHaveLength(1)
      const view = (await request(app).get(`/api/emergency/${caseId}`).expect(200)).body
      expect(view.contactAlerts[0]).toMatchObject({ name: 'Meera Sharma', channels: ['email', 'whatsapp'] })
      expect(view.contactAlerts[0].whatsappLink).toMatch(/^https:\/\/wa\.me\/919800000001\?text=/)
      const token = c.contactAlerts[0].statusLinkToken
      const page = (await request(app).get(`/api/emergency/status/${token}`).expect(200)).body
      expect(page).toMatchObject({ patientName: 'Rahul Sharma', status: 'searching', seen: false })
      await request(app).post(`/api/emergency/status/${token}/seen`).expect(200)
      expect((await request(app).get(`/api/emergency/status/${token}`)).body.seen).toBe(true)
      await request(app).get('/api/emergency/status/' + 'f'.repeat(32)).expect(404)
    })

    it('cancel with "false alarm" closes it, tells the socket, and marks the detection a false alarm', async () => {
      await request(app).post(`/api/emergency/${caseId}/cancel`).send({ reason: 'bad' }).expect(400)
      const res = await request(app).post(`/api/emergency/${caseId}/cancel`).send({ reason: 'false_alarm', note: 'Pressed by mistake' }).expect(200)
      expect(res.body.case).toMatchObject({ status: 'cancelled', isLive: false, cancellation: { reason: 'false_alarm', afterAcceptance: false } })
      await wait(100)
      expect(heard(EV.CANCELLED).at(-1).payload).toMatchObject({ caseId, reason: 'false_alarm', afterAcceptance: false })
      const c = await EmergencyCase.findById(caseId).lean()
      expect((await Detection.findById(c.detectionRef)).outcome).toBe('false_alarm')
      await request(app).post(`/api/emergency/${caseId}/cancel`).send({ reason: 'other' }).expect(409)
      await request(app).post(`/api/emergency/${caseId}/confirm`).send({}).expect(409)
    })

    it('shows up in the incident history with its timeline', async () => {
      const res = await request(app).get('/api/emergency/mine').query({ patient: 'HT-2026-0001' }).expect(200)
      expect(res.body).toMatchObject({ total: 1, page: 1, simulated: true })
      const item = res.body.items[0]
      expect(item).toMatchObject({ id: caseId, status: 'cancelled' })
      expect(item.timeline.map((e) => e.type)).toEqual(expect.arrayContaining(['detection', 'sent', 'contacts_alerted', 'cancelled']))
      expect((await request(app).get('/api/emergency/active').query({ patient: 'HT-2026-0001' })).body.case).toBeNull()
    })
  })

  describe('the countdown running out, on the server', () => {
    it('sends by itself at the stored deadline when nobody answers', async () => {
      await tick(30)
      await engine.setScenario(String(ananya._id), 'cardiac_event')
      await tick(60)
      await wait(150)
      const created = heard(EV.CREATED).filter((e) => e.payload.patientCode === 'HT-2026-0002').at(-1)
      const id = created.payload.caseId
      // shorten the stored deadline instead of waiting 10 s, then re-arm as a restarted server would
      await EmergencyCase.updateOne({ _id: id }, { $set: { 'escalation.confirmDeadline': new Date(Date.now() + 200) } })
      await emergency.start()
      await wait(700)
      const c = await EmergencyCase.findById(id).lean()
      expect(c).toMatchObject({ status: 'searching', escalation: { autoSent: true }, symptoms: { noResponse: true } })
      expect(heard(EV.SENT).filter((e) => e.payload.caseId === id)).toMatchObject([{ payload: { how: 'auto' } }])
      expect(heard(EV.CONFIRMED).filter((e) => e.payload.caseId === id)).toHaveLength(0)
    })
  })

  describe('SOS, history and first aid', () => {
    it('SOS for a patient with no case opens one in searching (201) with the location, then a repeat is 200', async () => {
      const res = await request(app).post('/api/emergency/sos').send({ patient: String(vikram._id), location: { lng: 73.9, lat: 18.5, source: 'manual', address: 'Kothrud' } }).expect(201)
      expect(res.body).toMatchObject({ created: true, case: { status: 'searching', source: 'manual_sos', patientCode: 'HT-2026-0003', location: { source: 'manual', address: 'Kothrud' } } })
      await request(app).post('/api/emergency/sos').send({ patient: 'HT-2026-0003' }).expect(200)
      expect(await EmergencyCase.countDocuments({ patient: vikram._id })).toBe(1)
    })

    it('validates the request', async () => {
      await request(app).post('/api/emergency/sos').send({}).expect(400)
      await request(app).post('/api/emergency/sos').send({ patient: 'HT-2026-9999' }).expect(404)
      await request(app).post('/api/emergency/sos').set('Content-Type', 'application/json').send('{oops').expect(400)
      await request(app).get('/api/emergency/mine').query({ patient: 'HT-2026-0001', page: 0 }).expect(400)
      await request(app).get('/api/emergency/mine').query({ patient: 'HT-2026-0001', limit: 51 }).expect(400)
      await request(app).get('/api/emergency/not-an-id').expect(404)
      await request(app).post('/api/emergency/not-an-id/confirm').send({}).expect(404)
    })

    it('history pages', async () => {
      const res = await request(app).get('/api/emergency/mine').query({ patient: 'HT-2026-0001', limit: 1, page: 2 }).expect(200)
      expect(res.body.items).toHaveLength(0)
      expect(res.body.pages).toBe(1)
    })

    it('first aid: 112/108 and the source always; aspirin only for a record that clearly allows it', async () => {
      const ok = (await request(app).get('/api/emergency/first-aid').query({ patient: 'HT-2026-0002' }).expect(200)).body // Ananya: allergies [] and medications []
      expect(ok.aspirin).toEqual({ shown: true, reason: 'record_clear' })
      expect(ok.steps.map((s) => s.id)).toContain('aspirin')
      for (const code of ['HT-2026-0001', 'HT-2026-0003']) {
        const hidden = (await request(app).get('/api/emergency/first-aid').query({ patient: code }).expect(200)).body // no allergy/medicine record
        expect(hidden.aspirin).toMatchObject({ shown: false, reason: 'incomplete_record' })
        expect(hidden.steps.map((s) => s.id)).not.toContain('aspirin')
        expect(hidden.numbers.map((n) => n.number)).toEqual(['112', '108'])
        expect(hidden.source.url).toMatch(/medlineplus/)
      }
    })
  })

  describe('interim access', () => {
    it('every patient route sits behind the guard, but the family link does not', async () => {
      const guarded = express()
      guarded.use('/api/emergency', (await import('../src/emergency/routes.js')).createEmergencyRouter(emergency, { guard: (_q, res) => res.status(401).json({ error: 'no' }) }))
      await request(guarded).post('/api/emergency/sos').send({ patient: 'HT-2026-0001' }).expect(401)
      await request(guarded).get('/api/emergency/mine').query({ patient: 'HT-2026-0001' }).expect(401)
      await request(guarded).post('/api/emergency/anything/cancel').send({ reason: 'other' }).expect(401)
      await request(guarded).get('/api/emergency/status/' + 'a'.repeat(32)).expect(404) // reaches the token lookup, not the guard
    })
  })
})
