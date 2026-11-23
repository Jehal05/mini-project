// The SOS vocabulary the screens need, copied from shared/emergency.js (the client cannot import that folder).
// emergency.test.js compares these with the shared file, so they cannot drift.
export const EMERGENCY_EVENTS = Object.freeze({
  CREATED: 'emergency:created', CONFIRMED: 'emergency:confirmed', SENT: 'emergency:sent', ESCALATED: 'emergency:escalated',
  UNRESOLVED: 'emergency:unresolved', CANCELLED: 'emergency:cancelled', ACK: 'emergency:ack', LOCATION: 'emergency:location', CONTACTS: 'emergency:contacts',
});
export const CANCEL_REASONS = Object.freeze(['false_alarm', 'feeling_better', 'already_at_hospital', 'other']);
export const SYMPTOMS = Object.freeze({
  chestPain: 'Chest pain or discomfort',
  upperBodyPain: 'Arm, shoulder, jaw, neck or back pain',
  shortnessOfBreath: 'Shortness of breath',
  nauseaOrLightheaded: 'Nausea or light-headedness',
});
export const ESCALATION = Object.freeze({ RADII_KM: [10, 20, 30], ROUND_TIMEOUT_MS: 60_000, CONFIRM_COUNTDOWN_MS: 10_000 });
export const EMERGENCY_NUMBERS = Object.freeze([
  { number: '112', label: 'Emergency (all services)' },
  { number: '108', label: 'Ambulance' },
]);
