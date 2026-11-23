// How a case status is worded and coloured. Red only for emergencies (design system rule).
export const STATUS_TEXT = {
  awaiting_confirmation: 'Waiting for you to confirm',
  searching: 'Looking for a hospital',
  accepted: 'A hospital has accepted',
  ambulance_assigned: 'An ambulance is on its way',
  patient_on_board: 'On the way to the hospital',
  arrived: 'Arrived at the hospital',
  admitted: 'Admitted',
  closed: 'Closed',
  unresolved: 'No hospital has accepted yet: call 112',
  cancelled: 'Cancelled',
}
export const STATUS_TONE = {
  awaiting_confirmation: 'critical',
  searching: 'critical',
  accepted: 'warning',
  ambulance_assigned: 'warning',
  patient_on_board: 'warning',
  arrived: 'normal',
  admitted: 'normal',
  closed: 'neutral',
  unresolved: 'critical',
  cancelled: 'neutral',
}
export const CANCEL_LABEL = {
  false_alarm: 'It was a false alarm',
  feeling_better: 'I am feeling better',
  already_at_hospital: 'I am already at a hospital',
  other: 'Another reason',
}
export const SOURCE_TEXT = { auto_detection: 'Detected automatically', manual_sos: 'SOS button', bystander_qr: 'Bystander SOS' }
export const OUTCOME_LABEL = { sent: 'Sent to hospitals', cancelled: 'Cancelled', false_alarm: 'False alarm' }
