// Starts live monitoring and detection on our server. Call once from server.js after the HTTP server and Socket.IO exist.
//   REST:    /api/sim/*        monitoring (vitals, history, timeline, trends, scenarios)
//            /api/detection/*  rules, thresholds, status, history
//   Socket:  `vitals:subscribe` { patientId } (token in the socket handshake) joins the private `vitals:<id>` room
// A Level 3 detection opens ONE emergency case in 'awaiting_confirmation'; the SOS flow (src/emergency) sends it after the countdown.
//   REST: /api/emergency/*  (SOS, confirm, cancel, location, contacts, first aid, history)
import mongoose from 'mongoose';
import { attachSimulation } from '../simulation/index.js';
import { attachDetection } from '../detection/index.js';
import { attachEmergency } from '../emergency/index.js';
import { Patient } from '../models/index.js';
import { canAccess, doctorGuard, monitorGuard, presenterGuard, socketAuthorizer } from './auth.js';

export async function attachMonitoring({ app, io, logger = console } = {}) {
  const exists = async (id) => mongoose.isValidObjectId(id) && Boolean(await Patient.exists({ _id: id }));
  const engine = await attachSimulation({ app, io, logger, guard: monitorGuard, presenterGuard, canAccess, authorizeSubscribe: socketAuthorizer({ patientExists: exists }) });
  const detection = await attachDetection({ app, io, engine, logger, guard: monitorGuard, presenterGuard, doctorGuard, canAccess });
  // Level 3 opens a case that waits for the patient ("Are you okay?", 10 s). Hospitals are searched when it is sent (Phase 7).
  const emergency = await attachEmergency({ app, io, detection, guard: monitorGuard, logger });
  return { engine, detection, emergency, stop: () => { engine.stop?.(); detection.stop?.(); emergency.stop?.(); } };
}
