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
import { AuditLog, Patient } from '../models/index.js';
import { canAccess, doctorGuard, monitorGuard, presenterGuard, socketAuthorizer } from './auth.js';

// Feature 98: threshold changes (feature 36) go to the audit log as well as the change list kept with the settings.
const auditThresholdChange = (logger) => (entry) => AuditLog.create({
  action: entry.scope === 'global' ? 'detection_config_changed' : 'detection_patient_thresholds_changed',
  resourceType: 'detection', resourceRef: entry.scope, meta: { role: entry.actorRole, actorId: entry.actorId, summary: entry.summary, before: entry.before, after: entry.after },
}).catch((e) => logger?.error?.('[audit]', e));

export async function attachMonitoring({ app, io, logger = console } = {}) {
  const exists = async (id) => mongoose.isValidObjectId(id) && Boolean(await Patient.exists({ _id: id }));
  const engine = await attachSimulation({ app, io, logger, guard: monitorGuard, presenterGuard, canAccess, authorizeSubscribe: socketAuthorizer({ patientExists: exists }) });
  const detection = await attachDetection({ app, io, engine, logger, guard: monitorGuard, presenterGuard, doctorGuard, canAccess, audit: auditThresholdChange(logger) });
  // Level 3 opens a case that waits for the patient ("Are you okay?", 10 s). Hospitals are searched when it is sent (Phase 7).
  const emergency = await attachEmergency({ app, io, detection, guard: monitorGuard, logger });
  return { engine, detection, emergency, stop: () => { engine.stop?.(); detection.stop?.(); emergency.stop?.(); } };
}
