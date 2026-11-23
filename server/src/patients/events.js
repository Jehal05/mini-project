import { EventEmitter } from 'node:events';

// In-process events from the patient-record features. The SOS flow (Daksh's phase 7) subscribes to BYSTANDER_REPORT:
//   patientEvents.on(PATIENT_EVENTS.BYSTANDER_REPORT, ({ reportId, patient, patientId, location, reportedAt }) => { ... });
// The BystanderReport row stays "pending" until the consumer sets it to "handed_off" or "dismissed".
export const PATIENT_EVENTS = Object.freeze({ BYSTANDER_REPORT: 'emergency:bystander_report' });
export const patientEvents = new EventEmitter();
