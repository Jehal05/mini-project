// Starts live monitoring and detection on our server. Call once from server.js after the HTTP server and Socket.IO exist.
//   REST:    /api/sim/*        monitoring (vitals, history, timeline, trends, scenarios)
//            /api/detection/*  rules, thresholds, status, history
//   Socket:  `vitals:subscribe` { patientId } (token in the socket handshake) joins the private `vitals:<id>` room
// A Level 3 detection opens ONE emergency case and starts hospital discovery (the same path as the demo emergency).
import mongoose from 'mongoose';
import { attachSimulation } from '../simulation/index.js';
import { attachDetection } from '../detection/index.js';
import { notifyHospitals } from '../services/notifications.js';
import { Patient } from '../models/index.js';
import { canAccess, doctorGuard, monitorGuard, presenterGuard, socketAuthorizer } from './auth.js';

export async function attachMonitoring({ app, io, logger = console } = {}) {
  const exists = async (id) => mongoose.isValidObjectId(id) && Boolean(await Patient.exists({ _id: id }));
  const engine = await attachSimulation({ app, io, logger, guard: monitorGuard, presenterGuard, canAccess, authorizeSubscribe: socketAuthorizer({ patientExists: exists }) });
  const detection = await attachDetection({ app, io, engine, logger, guard: monitorGuard, presenterGuard, doctorGuard, canAccess });
  detection.onCaseCreated(async (c) => {
    try { await notifyHospitals(c.caseId); } catch (e) { logger.error('[monitoring] could not start hospital discovery:', e.message); }
  });
  return { engine, detection, stop: () => { engine.stop?.(); detection.stop?.(); } };
}
