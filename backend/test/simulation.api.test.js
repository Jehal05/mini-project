// Features 26, 28, 30 over HTTP and Socket.IO, against a real (in-memory) MongoDB.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { attachSimulation } from '../src/simulation/index.js'
import { seedPatients, backfillHistory } from '../src/dev/seed.js'
import { seededRng } from '../src/simulation/engine.js'
import { VitalReading } from '../src/models/VitalReading.js'
import { HealthEvent } from '../src/models/HealthEvent.js'
import { startMongo } from './helpers/mongo.js'

const mongo = await startMongo('simulation.api.test')

describe.skipIf(!mongo)('monitoring API (MongoDB)', () => {
  let app
  let server
  let io
  let engine
  let rahul
  let port
  // Engine clock starts 10 minutes in the past so saved readings fall inside "now" queries.
  let t = Date.now() - 10 * 60_000
  const tickN = async (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      t += 2000
      await engine.tick()
    }
  }

  beforeAll(async () => {
    await mongoose.connect(mongo.getUri('sim-api'))
    const patients = await seedPatients()
    rahul = patients.find((p) => p.patientCode === 'HT-2026-0001')
    await backfillHistory(patients)

    app = express()
    server = http.createServer(app)
    io = new Server(server)
    engine = await attachSimulation({ app, io, autoStart: false, engineOptions: { rng: seededRng(11), now: () => t } })
    await new Promise((r) => server.listen(0, r))
    port = server.address().port
  })

  afterAll(async () => {
    engine?.stop()
    io?.close()
    server?.close()
    await mongoose.disconnect()
    await mongo.stop()
  })

  it('seeds three fictional patients and is idempotent', async () => {
    await seedPatients()
    const res = await request(app).get('/api/sim/patients').expect(200)
    expect(res.body.map((p) => p.patientCode)).toEqual(['HT-2026-0001', 'HT-2026-0002', 'HT-2026-0003'])
    expect(res.body[0]).toMatchObject({ name: 'Rahul Sharma', bloodGroup: 'B+', city: 'Pune' })
    expect(res.body[0].live).toMatchObject({ simulated: true, scenario: 'stable' })
  })

  it('looks a patient up by code or id', async () => {
    const byCode = await request(app).get('/api/sim/patients/ht-2026-0001').expect(200)
    const byId = await request(app).get(`/api/sim/patients/${rahul._id}`).expect(200)
    expect(byCode.body.id).toBe(byId.body.id)
    await request(app).get('/api/sim/patients/HT-2026-9999').expect(404)
  })

  it('returns the live snapshot', async () => {
    const res = await request(app).get('/api/sim/patients/HT-2026-0001/vitals/latest').expect(200)
    expect(res.body.vitals.hr).toBeGreaterThan(60)
    expect(res.body.label).toBe('Simulated')
  })

  it('serves 1h, 24h and 7d history (feature 28)', async () => {
    const h1 = await request(app).get('/api/sim/patients/HT-2026-0001/vitals/history?range=1h').expect(200)
    expect(h1.body.simulated).toBe(true)
    expect(h1.body.points.length).toBeGreaterThanOrEqual(110) // one per 30 s
    expect(h1.body.points[0]).toHaveProperty('status')

    const h24 = await request(app).get('/api/sim/patients/HT-2026-0001/vitals/history?range=24h').expect(200)
    expect(h24.body.points.length).toBeGreaterThan(250)
    expect(h24.body.points.length).toBeLessThanOrEqual(290) // 5-minute buckets

    const h7 = await request(app).get('/api/sim/patients/HT-2026-0001/vitals/history?range=7d').expect(200)
    expect(h7.body.points.length).toBeGreaterThan(300)
    expect(h7.body.points.length).toBeLessThanOrEqual(340) // 30-minute buckets

    await request(app).get('/api/sim/patients/HT-2026-0001/vitals/history?range=1y').expect(400)
  })

  it('saves live readings to MongoDB so they survive a reload', async () => {
    const before = await VitalReading.countDocuments({ patient: rahul._id })
    await tickN(1)
    const after = await VitalReading.countDocuments({ patient: rahul._id })
    expect(after).toBe(before + 1)
    const latest = await VitalReading.findOne({ patient: rahul._id }).sort({ recordedAt: -1 })
    expect(latest.simulated).toBe(true)
  })

  it('switches scenario through the presenter endpoint and logs it (feature 26)', async () => {
    const res = await request(app).post('/api/sim/patients/HT-2026-0001/scenario').send({ scenario: 'cardiac_event' }).expect(200)
    expect(res.body.scenario).toBe('cardiac_event')
    const ev = await HealthEvent.findOne({ patient: rahul._id, type: 'scenario_change' })
    expect(ev.data).toEqual({ from: 'stable', to: 'cardiac_event' })
    await request(app).post('/api/sim/patients/HT-2026-0001/scenario').send({ scenario: 'party' }).expect(400)
  })

  it('shows readings and events on one timeline (feature 30)', async () => {
    await tickN(60)
    const res = await request(app).get('/api/sim/patients/HT-2026-0001/timeline?range=24h').expect(200)
    expect(res.body.readings.length).toBeGreaterThan(200)
    const types = res.body.events.map((e) => e.type)
    expect(types).toContain('scenario_change')
    expect(types).toContain('status_change')
    expect(res.body.readings.some((r) => r.status === 'critical')).toBe(true) // the cardiac minutes show up
  })

  it('keeps the scenario when the server restarts a new engine instance', async () => {
    const fresh = await attachSimulation({ autoStart: false })
    expect(fresh.snapshot(String(rahul._id)).scenario).toBe('cardiac_event')
    await request(app).post('/api/sim/patients/HT-2026-0001/scenario').send({ scenario: 'stable' }).expect(200)
  })

  it('pushes vitals:update to a subscribed socket in patient:<id>', async () => {
    const client = ioClient(`http://localhost:${port}`, { transports: ['websocket'] })
    try {
      const ack = await new Promise((resolve) => client.emit('vitals:subscribe', { patientId: String(rahul._id) }, resolve))
      expect(ack.ok).toBe(true)
      expect(ack.snapshot.patientCode).toBe('HT-2026-0001')
      const update = new Promise((resolve) => client.once('vitals:update', resolve))
      await tickN(1)
      const payload = await update
      expect(payload).toMatchObject({ patientId: String(rahul._id), simulated: true })
    } finally {
      client.close()
    }
  })
})
