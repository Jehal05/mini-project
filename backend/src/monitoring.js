// Wires Daksh's monitoring, detection and emergency modules into the HealthTwin server with real access control.
//
//   REST    /api/sim, /api/detection, /api/emergency     (JWT; see access/monitoringAccess.js)
//   Socket  the handshake carries the access token; rooms: patient:<id>, hospital:<id>, central-admin

import express from 'express'
import { auditDetectionChange, monitoringAccess } from './access/monitoringAccess.js'
import { socketAuth } from './access/socketAuth.js'
import { appEvents, EVENTS } from './events.js'
import { Patient } from './models/Patient.js'
import { attachDetection } from './detection/index.js'
import { attachEmergency } from './emergency/index.js'
import { attachSimulation } from './simulation/index.js'

/** Creates the router to pass to createApp({ extraApi }) and starts the modules. `discovery` is Puneet's hospital search. */
export async function createMonitoring({ io, discovery, notifier, audit = auditDetectionChange, logger = console, autoStart = true, simulationOptions = {}, emergencyOptions = {} } = {}) {
  const extraApi = express.Router()
  const rules = monitoringAccess()
  if (io) io.use(socketAuth)

  const engine = await attachSimulation({ app: extraApi, io, basePath: '/sim', logger, autoStart, ...rules, ...simulationOptions })
  const detection = await attachDetection({ app: extraApi, io, engine, basePath: '/detection', logger, autoStart, audit, ...rules })
  const emergency = await attachEmergency({ app: extraApi, io, detection, discovery, notifier, basePath: '/emergency', logger, guard: rules.guard, adminGuard: rules.presenterGuard, access: rules.access, ...emergencyOptions })

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
    stop() {
      appEvents.off(EVENTS.PROFILE_CHANGED, onProfile)
      emergency.stop?.()
      detection.stop?.()
      engine.stop?.()
    },
  }
}
