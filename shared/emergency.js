// HealthTwin AI: shared emergency-case vocabulary (Daksh, Phase 1 contract).
// Used by the EmergencyCase schema and by all three portals, so status names,
// reasons and severity levels are spelled the same everywhere.

/** Feature 38: severity levels. Only Level 3 creates an EmergencyCase. */
export const SEVERITY = Object.freeze({
  1: { key: 'watch', label: 'Level 1 Watch', action: "Shown on the patient's dashboard only" },
  2: { key: 'urgent', label: 'Level 2 Urgent', action: 'Patient and emergency contacts alerted' },
  3: { key: 'critical_cardiac', label: 'Level 3 Critical cardiac', action: 'Emergency case created; hospitals notified after the countdown' },
})

/** How the case started. */
export const CASE_SOURCE = Object.freeze({
  AUTO_DETECTION: 'auto_detection', // feature 39
  MANUAL_SOS: 'manual_sos', // feature 41
  BYSTANDER_QR: 'bystander_qr', // feature 106
})

/**
 * Case lifecycle. Owners in brackets.
 *   awaiting_confirmation  "Are you okay?" + 10 s countdown           [Daksh 43, 44]
 *   searching              hospitals notified, waiting for accept    [Puneet 59-61, Daksh 45]
 *   accepted               a hospital accepted                       [Puneet 65]
 *   ambulance_assigned     ambulance dispatched                      [Puneet 73, 74]
 *   patient_on_board       crew confirmed pickup                     [Puneet 79]
 *   arrived                at hospital                               [Puneet 80]
 *   admitted               admission recorded                        [Jehal 84]
 *   closed                 record complete                           [all]
 *   unresolved             3 search rounds failed; central admin alerted [Daksh 45]
 *   cancelled              cancelled with a reason                   [Daksh 49]
 */
export const CASE_STATUS = Object.freeze({
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  AMBULANCE_ASSIGNED: 'ambulance_assigned',
  PATIENT_ON_BOARD: 'patient_on_board',
  ARRIVED: 'arrived',
  ADMITTED: 'admitted',
  CLOSED: 'closed',
  UNRESOLVED: 'unresolved',
  CANCELLED: 'cancelled',
})

/** Statuses in which the case is still live and can be cancelled. */
export const ACTIVE_STATUSES = Object.freeze([
  CASE_STATUS.AWAITING_CONFIRMATION,
  CASE_STATUS.SEARCHING,
  CASE_STATUS.ACCEPTED,
  CASE_STATUS.AMBULANCE_ASSIGNED,
  CASE_STATUS.PATIENT_ON_BOARD,
  CASE_STATUS.UNRESOLVED,
])

/** Feature 49 */
export const CANCEL_REASONS = Object.freeze(['false_alarm', 'feeling_better', 'already_at_hospital', 'other'])

/** Feature 66 */
export const REJECT_REASONS = Object.freeze(['no_beds', 'no_cardiologist', 'cath_lab_busy', 'other'])

/** One entry per hospital notified for this case (features 60, 61, 65, 66). */
export const HOSPITAL_RESPONSE = Object.freeze({
  NOTIFIED: 'notified',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  TIMED_OUT: 'timed_out',
  SUPERSEDED: 'superseded', // another hospital accepted first
})

/** Feature 43: AHA warning signs asked on the confirmation screen. */
export const SYMPTOMS = Object.freeze({
  chestPain: 'Chest pain or discomfort',
  upperBodyPain: 'Arm, shoulder, jaw, neck or back pain',
  shortnessOfBreath: 'Shortness of breath',
  nauseaOrLightheaded: 'Nausea or light-headedness',
})

/** Feature 45: search rounds. */
export const ESCALATION = Object.freeze({
  RADII_KM: [10, 20, 30],
  ROUND_TIMEOUT_MS: 60_000,
  CONFIRM_COUNTDOWN_MS: 10_000,
})

export const LOCATION_SOURCES = Object.freeze(['gps', 'manual', 'registered_address', 'bystander'])

export const SCENARIOS = Object.freeze(['stable', 'exercise', 'fever', 'hypoxia', 'cardiac_event'])
