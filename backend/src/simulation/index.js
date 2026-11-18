// Self-contained monitoring module. Attach it to any Express app and Socket.IO server:
//
//   import { attachSimulation } from './simulation/index.js'
//   const engine = await attachSimulation({ app, io })   // REST under /api/sim, starts ticking
//
// Puneet's server can pass its auth middleware as `guard` (all routes) and a
// role check as `presenterGuard` (scenario switching), and can join sockets to
// `patient:<id>` itself instead of using the vitals:subscribe handler below.

import { SimulationEngine, VITALS_EVENT, patientRoom } from './engine.js'
import { mongoStore } from './store.js'
import { createSimulationRouter } from './routes.js'
import { Patient } from '../models/Patient.js'

export { SimulationEngine, VITALS_EVENT, patientRoom }
export { computeBaseline } from './baseline.js'
export { SCENARIO_INFO, scenarioTargets } from './scenarios.js'

export async function attachSimulation({
  app,
  io,
  basePath = '/api/sim',
  guard,
  presenterGuard,
  store = mongoStore,
  engineOptions = {},
  monitorAll = true,
  autoStart = true,
} = {}) {
  const engine = new SimulationEngine({ io, store, ...engineOptions })

  if (monitorAll) {
    const patients = await Patient.find({}).lean()
    for (const p of patients) await engine.addPatient(p)
  }

  if (app) app.use(basePath, createSimulationRouter(engine, { guard, presenterGuard }))

  if (io) {
    io.on('connection', (socket) => {
      // Dev convenience: a client asks to follow one patient.
      socket.on('vitals:subscribe', async ({ patientId } = {}, ack) => {
        if (!patientId) return ack?.({ error: 'patientId required' })
        if (!engine.has(patientId)) {
          const p = await Patient.findById(patientId).lean().catch(() => null)
          if (!p) return ack?.({ error: 'Patient not found' })
          await engine.addPatient(p)
        }
        socket.join(patientRoom(patientId))
        ack?.({ ok: true, snapshot: engine.snapshot(patientId) })
      })
      socket.on('vitals:unsubscribe', ({ patientId } = {}) => {
        if (patientId) socket.leave(patientRoom(patientId))
      })
    })
  }

  if (autoStart) engine.start()
  return engine
}
