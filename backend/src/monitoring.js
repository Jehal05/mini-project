// Wires Daksh's monitoring, detection and emergency modules into the HealthTwin server with real access control.
//
//   REST    /api/sim, /api/detection, /api/emergency, /api/response, /api/hospitals/nearby   (JWT; see access/monitoringAccess.js)
//   Socket  the handshake carries the access token; rooms: patient:<id>, hospital:<id>, central-admin

import express from 'express'
import { auditDetectionChange, monitoringAccess } from './access/monitoringAccess.js'
import { socketAuth } from './access/socketAuth.js'
import { appEvents, EVENTS } from './events.js'
import { Patient } from './models/Patient.js'
import { attachDetection } from './detection/index.js'
import { attachEmergency } from './emergency/index.js'
import { createPushRouter } from './push/routes.js'
import { createPushService } from './push/service.js'
import { createGeocoder } from './response/geocoder.js'
import { createLiveNotifier } from './emergency/liveNotifier.js'
import { attachSimulation } from './simulation/index.js'
import { AmbulanceService } from './response/ambulance.js'
import { createDiscovery } from './response/discovery.js'
import { createResponseRouter } from './response/routes.js'
import { ResponseService } from './response/service.js'

/** Creates the router to pass to createApp({ extraApi }) and starts the modules. `discovery` is Puneet's hospital search. */
export async function createMonitoring({ io, discovery: customDiscovery, notifier, audit = auditDetectionChange, logger = console, autoStart = true, simulationOptions = {}, emergencyOptions = {}, responseOptions = {} } = {}) {
  const extraApi = express.Router()
  const rules = monitoringAccess()
  if (io) io.use(socketAuth)

  const engine = await attachSimulation({ app: extraApi, io, basePath: '/sim', logger, autoStart, ...rules, ...simulationOptions })
  const detection = await attachDetection({ app: extraApi, io, engine, basePath: '/detection', logger, autoStart, audit, ...rules })
  // Hospital search, notification and the ambulance trip (features 51-80). A caller may still pass its own `discovery`.
  const pusher = createPushService({ logger, ...responseOptions.push }) // 47, 61: Web Push (off until VAPID keys are set)
  const discovery = customDiscovery ?? createDiscovery({ io, logger, pusher, ...responseOptions.discovery })
  const ambulances = new AmbulanceService({ io, logger, pusher, ...responseOptions.ambulance })
  const emergency = await attachEmergency({ app: extraApi, io, detection, discovery, pusher, notifier: notifier ?? createLiveNotifier({ logger }), basePath: '/emergency', logger, guard: rules.guard, adminGuard: rules.presenterGuard, access: rules.access, ...emergencyOptions })

  const response = new ResponseService({ io, discovery, ambulances, pusher, logger })
  extraApi.use(createPushRouter({ pusher }))
  extraApi.use(createResponseRouter({ service: response, ambulances, discovery, access: rules.access, geocoder: createGeocoder({ logger, ...responseOptions.geocoder }) }))
  if (autoStart) await ambulances.resume()

  // The patient edits their profile: the twin, the baseline and the risk score follow it.
  const onProfile = async ({ patient } = {}) => {
    try {
      const fresh = await Patient.findById(patient).lean()
      if (fresh) engine.updateProfile(fresh)
    } catch (err) {
      logger.error?.('[monitoring] could not refresh a profile', err.message)
    }
  }
  appEvents.on(EVENTS.PROFILE_CHANGED, onProfile)

  return {
    extraApi,
    engine,
    detection,
    emergency,
    response,
    pusher,
    ambulances,
    discovery,
    stop() {
      ambulances.stop()
      appEvents.off(EVENTS.PROFILE_CHANGED, onProfile)
      emergency.stop?.()
      detection.stop?.()
      engine.stop?.()
    },
  }
}
