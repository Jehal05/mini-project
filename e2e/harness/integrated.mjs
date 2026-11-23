// The INTEGRATED server (real login, real roles, real hospital search, real ambulances) on an in-memory MongoDB,
// serving the built frontend from the same origin. Nothing in here is faked.
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
export const DIST = path.join(root, 'e2e/dist')

export async function startIntegrated({ ambulanceSpeedKmh = 4000, roundTimeoutMs } = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test', RATE_LIMIT: 'off', MAIL_PROVIDER: 'console', STATIC_DIR: DIST,
    AMBULANCE_SPEED_KMH: String(ambulanceSpeedKmh), CLIENT_ORIGIN: 'http://127.0.0.1',
    JWT_ACCESS_SECRET: 'e2e-only-secret-0123456789abcdefghijkl',
  })
  const req = createRequire(path.join(root, 'backend/package.json'))
  const mongoose = req('mongoose')
  const { Server } = req('socket.io')
  const { MongoMemoryServer } = req('mongodb-memory-server')
  const load = (rel) => import(pathToFileURL(path.join(root, 'backend/src', rel)).href)

  const mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri('healthtwin_e2e'))
  const { seed, DEMO_PASSWORD } = await load('seed/seed.js')
  await seed({ log() {} })
  const { createApp } = await load('app.js')
  const { createMonitoring } = await load('monitoring.js')

  const server = http.createServer()
  const io = new Server(server)
  const logger = { log() {}, info() {}, warn() {}, error: console.error }
  const monitoring = await createMonitoring({ io, autoStart: true, logger, ...(roundTimeoutMs && { emergencyOptions: { roundTimeoutMs } }) })
  server.on('request', createApp({ extraApi: monitoring.extraApi }))
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${server.address().port}`

  const call = async (method, p, body, token) => {
    const r = await fetch(url + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text(); let json; try { json = JSON.parse(text) } catch { json = text }
    return { status: r.status, body: json }
  }
  const login = async (portal, email) => (await call('POST', `/auth/login/${portal}`.replace('/auth', '/api/auth'), { identifier: email, password: DEMO_PASSWORD })).body

  return {
    url, call, login, mongoose, monitoring, password: DEMO_PASSWORD,
    async stop() {
      monitoring.stop(); io.close(); server.closeAllConnections?.()
      await new Promise((ok) => server.close(ok))
      await mongoose.disconnect(); await mongod.stop()
    },
  }
}
