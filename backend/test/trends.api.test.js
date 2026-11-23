// Feature 92 over HTTP, against a real (in-memory) MongoDB.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { Server } from 'socket.io'
import { attachSimulation } from '../src/simulation/index.js'
import { seedPatients, backfillHistory } from '../src/dev/seed.js'
import { VitalReading } from '../src/models/VitalReading.js'
import { computeBaseline } from '../src/simulation/baseline.js'
import { startMongo } from './helpers/mongo.js'

const mongo = await startMongo('trends.api.test')
const H = 3_600_000

describe.skipIf(!mongo)('trends API (feature 92)', () => {
  let app, server, io, engine, rahul, ananya, vikram
  const put = (patient, from, to, stepMs, f) => {
    const docs = []
    for (let t = from; t <= to; t += stepMs) docs.push({ patient: patient._id, recordedAt: new Date(t), hr: f(t), sys: 120, dia: 78, spo2: 98, temp: 36.8, rr: 15, status: 'normal' })
    return VitalReading.insertMany(docs)
  }

  beforeAll(async () => {
    await mongoose.connect(mongo.getUri('trends-api'))
    const patients = await seedPatients()
    ;[rahul, ananya, vikram] = ['HT-2026-0001', 'HT-2026-0002', 'HT-2026-0003'].map((c) => patients.find((p) => p.patientCode === c))
    await backfillHistory(patients)
    app = express()
    server = http.createServer(app)
    io = new Server(server)
    engine = await attachSimulation({ app, io, autoStart: false })
  })
  afterAll(async () => {
    engine?.stop()
    io?.close()
    server?.close()
    await mongoose.disconnect()
    await mongo.stop()
  })

  it('steady demo history: every vital is steady, resting HR has 7 days, nothing drifts, labelled simulated', async () => {
    const { body } = await request(app).get('/api/sim/patients/HT-2026-0001/trends').expect(200)
    expect(body.simulated).toBe(true)
    expect(body.baseline).toEqual(computeBaseline(rahul))
    for (const k of ['hr', 'sys', 'dia', 'spo2', 'temp', 'rr']) {
      expect(body.last24h[k].state).toBe('ok')
      expect(body.last24h[k].direction, `24h ${k}`).toBe('steady')
      expect(body.last7d[k].direction, `7d ${k}`).toBe('steady')
      expect(body.drift[k].state, `drift ${k}`).toBe('none')
    }
    expect(body.restingHr.days).toHaveLength(7)
    expect(body.restingHr.days.every((d) => typeof d.value === 'number')).toBe(true)
  })

  it('a patient with no readings gets "not enough data" everywhere, never zeros or "steady"', async () => {
    await VitalReading.deleteMany({ patient: vikram._id })
    const { body } = await request(app).get('/api/sim/patients/HT-2026-0003/trends').expect(200)
    expect(body.last24h.hr.state).toBe('not_enough_data')
    expect(body.last7d.hr.state).toBe('not_enough_data')
    expect(body.restingHr.state).toBe('not_enough_data')
    expect(body.drift.hr.state).toBe('not_enough_data')
    expect(JSON.stringify(body)).not.toMatch(/"direction":"steady"/)
  })

  it('a resting heart rate creeping up over days shows as rising resting HR and as drift away from baseline', async () => {
    await VitalReading.deleteMany({ patient: ananya._id })
    const now = Date.now()
    const base = computeBaseline(ananya).hr
    await put(ananya, now - 7 * 24 * H, now - 60_000, 15 * 60_000, (t) => base + ((t - (now - 7 * 24 * H)) / (24 * H)) * 1.5)
    const { body } = await request(app).get('/api/sim/patients/HT-2026-0002/trends').expect(200)
    expect(body.restingHr.direction).toBe('rising')
    expect(body.restingHr.perDay).toBeGreaterThan(1)
    expect(body.drift.hr).toMatchObject({ state: 'drifting', direction: 'up' })
    expect(body.drift.sys.state).toBe('none') // the other vitals stayed put
  })

  it('a heart rate that jumped in the last hours is rising in the 24 h view but not called drift or resting-HR change', async () => {
    await VitalReading.deleteMany({ patient: rahul._id })
    const now = Date.now()
    const base = computeBaseline(rahul).hr
    await put(rahul, now - 7 * 24 * H, now - 6 * H, 15 * 60_000, () => base)
    await put(rahul, now - 6 * H, now - 30_000, 5 * 60_000, (t) => base + ((t - (now - 6 * H)) / (6 * H)) * 50)
    const { body } = await request(app).get('/api/sim/patients/HT-2026-0001/trends').expect(200)
    expect(body.last24h.hr.direction).toBe('rising')
    expect(body.drift.hr.state).toBe('none')
    expect(body.restingHr.direction).toBe('steady')
  })

  it('unknown patients are a 404', async () => {
    await request(app).get('/api/sim/patients/HT-2099-9999/trends').expect(404)
  })
})
