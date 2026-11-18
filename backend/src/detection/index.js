// Attach the detection engine to an existing monitoring setup:
//
//   const engine = await attachSimulation({ app, io })
//   const detection = await attachDetection({ app, io, engine })   // REST under /api/detection
//   detection.onCaseCreated((c) => ...)                            // Puneet: start hospital discovery
//
// Detection listens to the engine's readings in-process, so it needs the same `io` and
// engine. Pass the same `guard` and `presenterGuard` you gave attachSimulation.
// TODO(Jehal): replace the interim guards with the real JWT/role checks.

import { createPresenterKeyGuard } from '../simulation/access.js'
import { DetectionService } from './service.js'
import { mongoDetectionStore } from './store.js'
import { createDetectionRouter } from './routes.js'

export { DetectionService } from './service.js'
export { RULES, describeRules } from './rules.js'
export { evaluate } from './evaluate.js'

export async function attachDetection({
  app,
  io,
  engine,
  basePath = '/api/detection',
  guard,
  presenterGuard = createPresenterKeyGuard(),
  store = mongoDetectionStore,
  logger = console,
  audit,
  autoStart = true,
} = {}) {
  if (!engine) throw new Error('attachDetection needs the engine returned by attachSimulation')
  const service = new DetectionService({ engine, store, io, logger, audit })
  await service.init()
  if (app) app.use(basePath, createDetectionRouter(service, { guard, presenterGuard }))
  if (autoStart) service.start()
  return service
}
