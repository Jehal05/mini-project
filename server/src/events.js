import { EventEmitter } from 'node:events';

/**
 * In-process events between features. Puneet's Socket.IO layer and Daksh's SOS flow subscribe here:
 *
 *   import { appEvents, EVENTS } from './events.js';
 *   appEvents.on(EVENTS.BYSTANDER_REPORT, (report) => { ... });
 *
 * emergency:bystander_report  (feature 106)
 *   Emitted after a bystander report is saved. Payload:
 *   { reportId, patient (Patient _id), patientId ("HT-2026-0001"),
 *     location: { latitude, longitude, accuracyMeters? }, reportedAt (Date) }
 *   The BystanderReport row has status "pending"; the consumer sets it to "handed_off" or "dismissed".
 */
export const EVENTS = Object.freeze({ BYSTANDER_REPORT: 'emergency:bystander_report' });

export const appEvents = new EventEmitter();
