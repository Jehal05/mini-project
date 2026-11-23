// How a case status is worded and coloured. Red only for emergencies.
// Our status names: 'pending' means hospitals are being searched for (Daksh's "searching"); 'en_route' means the ambulance is on the way.
export const STATUS_TEXT = {
  awaiting_confirmation: 'Waiting for you to confirm',
  pending: 'Looking for a hospital',
  accepted: 'A hospital has accepted',
  ambulance_assigned: 'An ambulance is on its way',
  en_route: 'An ambulance is on its way',
  arrived: 'Arrived at the hospital',
  closed: 'Closed',
  unresolved: 'No hospital has accepted yet: call 112',
  cancelled: 'Cancelled',
};
export const STATUS_TONE = {
  awaiting_confirmation: 'critical', pending: 'critical', accepted: 'high', ambulance_assigned: 'high', en_route: 'high',
  arrived: 'low', closed: 'neutral', unresolved: 'critical', cancelled: 'neutral',
};
export const AFTER_ACCEPTANCE = ['accepted', 'ambulance_assigned', 'en_route'];
export const CANCEL_LABEL = {
  false_alarm: 'It was a false alarm',
  feeling_better: 'I am feeling better',
  already_at_hospital: 'I am already at a hospital',
  other: 'Another reason',
};
export const SOURCE_TEXT = { auto_detection: 'Detected automatically', manual_sos: 'SOS button', bystander_qr: 'Bystander SOS', demo: 'Demo emergency' };
export const OUTCOME_LABEL = { sent: 'Sent to hospitals', cancelled: 'Cancelled', false_alarm: 'False alarm' };
