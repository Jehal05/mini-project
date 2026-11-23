// Review item 3: interim access control (no database needed).
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createPresenterKeyGuard, defaultAuthorizeSubscribe, PRESENTER_KEY_HEADER } from '../src/simulation/access.js'
import { attachSimulation } from '../src/simulation/index.js'
import { memoryStore } from '../src/simulation/store.js'

function appWith(env) {
  const app = express()
  app.post('/scenario', createPresenterKeyGuard({ env }), (_req, res) => res.json({ ok: true }))
  return app
}

describe('presenter key guard', () => {
  it('is open in development when PRESENTER_KEY is unset', async () => {
    await request(appWith({ NODE_ENV: 'development' })).post('/scenario').expect(200)
  })

  it('fails closed in production when PRESENTER_KEY is unset', async () => {
    const res = await request(appWith({ NODE_ENV: 'production' })).post('/scenario').expect(503)
    expect(res.body.error).toMatch(/PRESENTER_KEY/)
  })

  it('requires the matching header when PRESENTER_KEY is set', async () => {
    const app = appWith({ NODE_ENV: 'production', PRESENTER_KEY: 'demo-2026' })
    const missing = await request(app).post('/scenario').expect(401)
    expect(missing.body.code).toBe('PRESENTER_KEY_REQUIRED')
    await request(app).post('/scenario').set(PRESENTER_KEY_HEADER, 'wrong').expect(401)
    await request(app).post('/scenario').set(PRESENTER_KEY_HEADER, 'demo-2026-x').expect(401) // different length
    await request(app).post('/scenario').set(PRESENTER_KEY_HEADER, 'demo-2026').expect(200)
  })
})

describe('vitals:subscribe authorisation', () => {
  function fakeIo() {
    const io = { handlers: {}, on: (evt, fn) => (io.handlers[evt] = fn), to: () => ({ emit() {} }) }
    return io
  }
  function fakeSocket() {
    const s = { handlers: {}, on: (evt, fn) => (s.handlers[evt] = fn), join: vi.fn(), leave: vi.fn() }
    return s
  }

  it('defaults to allow in development and deny in production', async () => {
    expect(await defaultAuthorizeSubscribe({ env: { NODE_ENV: 'development' } })({}, 'p1')).toBe(true)
    expect(await defaultAuthorizeSubscribe({ env: { NODE_ENV: 'production' } })({}, 'p1')).toBe(false)
  })

  it('does not join the room when the hook says no', async () => {
    const io = fakeIo()
    const hook = vi.fn().mockResolvedValue(false)
    const engine = await attachSimulation({ io, store: memoryStore(), monitorAll: false, autoStart: false, authorizeSubscribe: hook })
    const socket = fakeSocket()
    io.handlers.connection(socket)
    const ack = await new Promise((resolve) => socket.handlers['vitals:subscribe']({ patientId: 'p1' }, resolve))
    expect(hook).toHaveBeenCalledWith(socket, 'p1')
    expect(ack.error).toMatch(/Not allowed/)
    expect(socket.join).not.toHaveBeenCalled()
    expect(engine.list()).toHaveLength(0)
  })

  it('treats a hook that throws as a denial', async () => {
    const io = fakeIo()
    await attachSimulation({ io, store: memoryStore(), monitorAll: false, autoStart: false, authorizeSubscribe: () => Promise.reject(new Error('boom')) })
    const socket = fakeSocket()
    io.handlers.connection(socket)
    const ack = await new Promise((resolve) => socket.handlers['vitals:subscribe']({ patientId: 'p1' }, resolve))
    expect(ack.error).toMatch(/Not allowed/)
    expect(socket.join).not.toHaveBeenCalled()
  })
})
