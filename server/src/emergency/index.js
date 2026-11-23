// Attaches the SOS and emergency module (Phase 7, Daksh's design) to our server. Call once from monitoring/index.js.
//   REST   /api/emergency/*   (see routes.js)
//   Socket events go to the room patient:<id>; the unresolved alert also goes to the room central-admin
//   (joined with the `admin:subscribe` event, central_admin role only, token in the socket handshake).
import { EmergencyService } from './service.js';
import { createEmergencyRouter } from './routes.js';
import { createDiscovery } from './discovery.js';
import { ADMIN_ROOM } from '../../../shared/emergency.js';
import { CASE_SOURCE } from '../../../shared/emergency.js';
import { PATIENT_EVENTS, patientEvents } from '../patients/events.js';
import { adminSocketAuthorizer } from '../monitoring/auth.js';

export { EmergencyService } from './service.js';

export async function attachEmergency({ app, io, detection, guard, discovery = createDiscovery(), notifier, basePath = '/api/emergency', logger = console, ...options } = {}) {
  const service = new EmergencyService({ io, discovery, notifier, logger, ...options });
  if (app) app.use(basePath, createEmergencyRouter(service, { guard }));
  // A Level 3 detection opens a case waiting for confirmation: start its 10 s countdown (hospitals are searched after it).
  detection?.onCaseCreated((c) => service.arm(c.caseId).catch((e) => logger.error?.('[emergency] could not start countdown', e)));
  // Feature 106: someone who scanned the QR passport and tapped "report an emergency" starts the same flow as the SOS button,
  // using the scanner's location. A case already open for this patient is joined, not duplicated.
  patientEvents.on(PATIENT_EVENTS.BYSTANDER_REPORT, ({ patient, location }) => {
    const where = location?.latitude != null && location?.longitude != null ? { lat: location.latitude, lng: location.longitude, accuracyM: location.accuracyMeters, source: 'bystander' } : undefined;
    service.sos(patient, { location: where, source: CASE_SOURCE.BYSTANDER_QR, actorRole: 'bystander', message: 'A bystander reported an emergency using the QR passport' })
      .catch((e) => logger.error?.('[emergency] bystander report could not start a case', e));
  });
  if (io) {
    const authorize = adminSocketAuthorizer();
    io.on('connection', (socket) => {
      socket.on('admin:subscribe', async (_payload, ack) => {
        const ok = await authorize(socket);
        if (ok) socket.join(ADMIN_ROOM);
        if (typeof ack === 'function') ack({ ok });
      });
    });
  }
  const resumed = await service.start(); // cases that were mid-countdown or mid-search resume
  if (resumed) logger.log?.(`[emergency] resumed ${resumed} live case(s) after restart`);
  return service;
}
