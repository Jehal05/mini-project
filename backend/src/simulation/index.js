// Self-contained monitoring module. Attach it to any Express app and Socket.IO server:
//
//   import { attachSimulation } from './simulation/index.js'
//   const engine = await attachSimulation({ app, io })   // REST under /api/sim, starts ticking
//
// Puneet's server can pass its auth middleware as `guard` (all routes) and a
// role check as `presenterGuard` (scenario switching), and can join sockets to
// `patient:<id>` itself instead of using the vitals:subscribe handler below.
//
// Access control is INTERIM until Jehal's auth (Phase 2) lands; see access.js.
// TODO(Jehal): pass `guard`, `presenterGuard` and `authorizeSubscribe` built on the real JWT/roles.

import { SimulationEngine, VITALS_EVENT, patientRoom } from './engine.js'
import { mongoStore } from './store.js'
import { createSimulationRouter } from './routes.js'
import { Patient } from '../models/Patient.js'
import { createPresenterKeyGuard, defaultAuthorizeSubscribe } from './access.js'

export { SimulationEngine, VITALS_EVENT, patientRoom }
export { computeBaseline } from './baseline.js'
export { createPresenterKeyGuard, defaultAuthorizeSubscribe, PRESENTER_KEY_HEADER } from './access.js'
export { SCENARIO_INFO, scenarioTargets } from './scenarios.js'

export async function attachSimulation({
  app,
  io,
  basePath = '/api/sim',
  guard,
  presenterGuard = createPresenterKeyGuard(),
  authorizeSubscribe = defaultAuthorizeSubscribe(),
  store = mongoStore,
  engineOptions = {},
  monitorAll = true,
  autoStart = true,
  logger = console,
} = {}) {
  const engine = new SimulationEngine({ io, store, logger, ...engineOptions })

  if (Patient.isHealthTwinPlaceholder) {
    // Review item 12: make it obvious when the stand-in model is still in use.
    logger.warn(
      '[simulation] Using the PLACEHOLDER Patient model (backend/src/models/Patient.js). ' +
        "Swap in Jehal's model before release: see docs/phase5-monitoring.md.",
    )
  }

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
        // TODO(Jehal): real check (patient themself, family link, or hospital staff on their case).
        const allowed = await Promise.resolve(authorizeSubscribe(socket, String(patientId))).catch(() => false)
        if (!allowed) return ack?.({ error: 'Not allowed to follow this patient' })
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
