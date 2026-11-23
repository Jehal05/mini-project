// End-to-end harness: the REAL Daksh-track code (simulation, detection, emergency, built frontend) on a
// real MongoDB, plus clearly labelled stand-ins for what is not on this branch yet.
//
//   FAKE: replace when Puneet's hospital discovery lands   -> `discovery` below and POST /__e2e/hospital-accept
//   FAKE: replace when Jehal's auth lands                  -> no login: the interim presenter key / open routes
//
// Every start gets its own empty in-memory database, so tests cannot leak into each other.
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const req = createRequire(path.join(root, 'backend/package.json'))
const express = req('express')
const { Server } = req('socket.io')
const mongoose = req('mongoose')
const { MongoMemoryServer } = req('mongodb-memory-server')
const load = (rel) => import(pathToFileURL(path.join(root, 'backend/src', rel)).href)

export const DIST = path.join(root, 'e2e/dist')

export async function startHarness({ port = 0, roundSeconds = 60, tickMs = 400, presenterKey, fakeDiscovery = true, quiet = true } = {}) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Frontend not built for e2e. Run: npm run build:frontend (in e2e/)')
  const mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri('healthtwin_e2e'))

  const { seedPatients, backfillHistory } = await load('dev/seed.js')
  const { attachSimulation } = await load('simulation/index.js')
  const { attachDetection } = await load('detection/index.js')
  const { attachEmergency } = await load('emergency/index.js')
  const { EmergencyCase } = await load('models/EmergencyCase.js')
  const { createPresenterKeyGuard } = await load('simulation/access.js')

  const patients = await seedPatients()
  await backfillHistory(patients)
  const ids = Object.fromEntries(patients.map((p) => [p.patientCode, String(p._id)]))
  const logger = quiet ? { log() {}, warn() {}, error: console.error, info() {} } : console
  const notified = [] // FAKE: replace when Puneet's hospital discovery lands. What would have gone to hospitals.
  const stack = { ids, mongoose, notified, EmergencyCase }

  // Boots the whole server on top of the SAME database. restart() calls it again to prove state survives.
  async function boot(listenPort) {
    const app = express()
    app.use(express.json())
    app.get('/health', (_q, r) => r.json({ ok: true }))
    const server = http.createServer(app)
    const io = new Server(server)
    const presenterGuard = createPresenterKeyGuard({ env: presenterKey ? { PRESENTER_KEY: presenterKey } : {} })
    const engine = await attachSimulation({ app, io, engineOptions: { tickMs }, presenterGuard, logger })
    const detection = await attachDetection({ app, io, engine, presenterGuard, logger })
    // FAKE: replace when Puneet's hospital discovery lands.
    const discovery = fakeDiscovery ? { notify: async (n) => { notified.push({ ...n, at: Date.now() }); return [] } } : undefined
    const emergency = await attachEmergency({ app, io, detection, discovery, roundTimeoutMs: roundSeconds * 1000, logger })

    // Test-only controls, never mounted outside the harness.
    app.get('/__e2e/notified', (_q, r) => r.json(notified))
    // FAKE: replace when Puneet's hospital accept (acceptIfPending) is wired to a hospital portal.
    app.post('/__e2e/hospital-accept', async (q, r) => {
      const c = await EmergencyCase.findOneAndUpdate(
        { _id: q.body.caseId, status: 'searching' },
        { $set: { status: 'accepted', acceptedAt: new Date() }, $push: { timeline: { type: 'accepted', at: new Date(), actorRole: 'hospital_staff', data: { fake: true } } } },
        { new: true },
      )
      if (c) emergency.emit(c, 'emergency:ack', { fake: true })
      r.json({ ok: Boolean(c) })
    })
    // FAKE hospital console: a stand-in for Puneet's hospital portal so the demo can show "a hospital accepts".
    app.get('/__e2e/hospital', (_q, r) => r.type('html').send(`<!doctype html><meta charset="utf-8"><title>FAKE hospital console</title>
<body style="font:16px system-ui;max-width:36rem;margin:2rem auto;padding:0 1rem">
<h1>FAKE hospital console</h1><p><strong>FAKE: replace when Puneet's hospital portal lands.</strong> Simulated demo only.</p>
<p id="none">No case is waiting for a hospital.</p><ul id="list"></ul>
<script>
async function tick(){const cs=(await (await fetch('/__e2e/db-cases')).json()).filter(c=>c.status==='searching');
document.getElementById('none').hidden=cs.length>0;
document.getElementById('list').innerHTML=cs.map(c=>'<li>'+c.patientCode+' (round '+c.escalation.round+') <button data-id="'+c._id+'">Accept this emergency</button></li>').join('');}
document.addEventListener('click',async e=>{const id=e.target.dataset?.id;if(id){await fetch('/__e2e/hospital-accept',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({caseId:id})});tick()}});
setInterval(tick,700);tick();</script>`))
    app.get('/__e2e/db-cases', async (_q, r) => r.json(await EmergencyCase.find({}).lean()))
    app.use(express.static(DIST))
    app.use((q, r, next) => (q.method === 'GET' && !q.path.startsWith('/api') && !q.path.startsWith('/socket.io') ? r.sendFile(path.join(DIST, 'index.html')) : next()))

    await new Promise((ok) => server.listen(listenPort, '127.0.0.1', ok))
    const close = async () => {
      emergency.stop(); detection.stop(); engine.stop()
      io.close(); server.closeAllConnections?.()
      await new Promise((ok) => server.close(ok))
    }
    return { server, io, engine, detection, emergency, close, port: server.address().port }
  }

  let live = await boot(port)
  Object.assign(stack, {
    get url() { return `http://127.0.0.1:${live.port}` },
    get io() { return live.io },
    get engine() { return live.engine },
    get detection() { return live.detection },
    get emergency() { return live.emergency },
    /** Stop the server (the database stays). Pair with start() to simulate an outage. */
    async down() { await live.close(); live = { ...live, closed: true } },
    async start() { live = await boot(live.port) },
    async restart() { await live.close(); live = await boot(live.port) },
    async stop() {
      if (!live.closed) await live.close()
      await mongoose.disconnect(); await mongod.stop()
    },
  })
  return stack
}
