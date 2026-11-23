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
export const EVENTS = Object.freeze({
  BYSTANDER_REPORT: 'emergency:bystander_report',
  BEDS_CHANGED: 'hospital:beds_changed',
  DOCTOR_DUTY_CHANGED: 'hospital:doctor_duty_changed',
  PROFILE_CHANGED: 'patient:profile_changed',
});

/**
 * hospital:beds_changed  (feature 85)  { hospitalId, availability }  availability = services/beds.js getBedAvailability()
 *   Emitted after every bed change so Puneet's Socket.IO layer can push the new counts to the hospital room.
 * hospital:doctor_duty_changed  (feature 83)  { hospitalId, cardiologistOnDuty (boolean), doctorsOnDuty (number) }
 */

/**
 * patient:profile_changed  { patient (Patient _id) }
 * Emitted after the patient edits their own profile (personal details, conditions, allergies, medicines,
 * family history, contacts). Monitoring reloads the profile so the risk score and baseline follow it.
 */
export const appEvents = new EventEmitter();
