// Attach the SOS / emergency module (Phase 7) to an existing monitoring + detection setup:
//
//   const engine = await attachSimulation({ app, io })
//   const detection = await attachDetection({ app, io, engine })
//   const emergency = await attachEmergency({ app, io, detection, discovery })   // REST under /api/emergency
//
// `discovery` is Puneet's hospital search: { notify({ caseId, round, radiusKm, location, caseSnapshot }) }.
// It is called when a case is sent and again at every wider round, and it is not on main yet, so the
// default does nothing. Without it a case still moves through its states and the events still fire.
// TODO(Puneet): pass the real discovery. TODO(Jehal): pass the real `guard`, and use the unresolved
// alert (event emergency:unresolved to the central-admin room) in the admin portal.

import { EmergencyService } from './service.js'
import { createEmergencyRouter } from './routes.js'

export { EmergencyService } from './service.js'
export { createDevNotifier, buildWhatsAppLink } from './notifier.js'

export async function attachEmergency({ app, io, detection, discovery, notifier, guard, basePath = '/api/emergency', logger = console, ...serviceOptions } = {}) {
  const service = new EmergencyService({ io, discovery, notifier, logger, ...serviceOptions })
  if (app) app.use(basePath, createEmergencyRouter(service, { guard }))
  // A Level 3 detection opens a case waiting for confirmation: start its 10 s countdown.
  detection?.onCaseCreated((c) => service.arm(c.caseId).catch((e) => logger.error?.('[emergency] could not start countdown', e)))
  const resumed = await service.start() // cases that were mid-countdown or mid-search resume
  if (resumed) logger.log?.(`[emergency] resumed ${resumed} live case(s) after restart`)
  return service
}
