// How Daksh's SOS vocabulary maps onto OUR case statuses (Phase 7).
//   his "searching"  = our 'pending'   (hospitals are being searched for; Phase 9 code only ever looks at 'pending')
//   his "patient_on_board" = our 'en_route' (an ambulance has been dispatched)
// The shared constants stay unchanged so his screens and tests keep their meaning.
export const S = Object.freeze({
  AWAITING: 'awaiting_confirmation',
  SEARCHING: 'pending',
  ACCEPTED: 'accepted',
  AMBULANCE_ASSIGNED: 'ambulance_assigned',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  CLOSED: 'closed',
  UNRESOLVED: 'unresolved',
  CANCELLED: 'cancelled',
});

/** Cases that can still be cancelled and that the patient's screen follows. */
export const ACTIVE = Object.freeze([S.AWAITING, S.SEARCHING, S.ACCEPTED, S.AMBULANCE_ASSIGNED, S.EN_ROUTE, S.UNRESOLVED]);
/** One live case per patient: the above, plus the patient already at the hospital. */
export const LIVE = Object.freeze([...ACTIVE, S.ARRIVED]);
/** Before any hospital accepted. */
export const PRE_ACCEPT = Object.freeze([S.AWAITING, S.SEARCHING, S.UNRESOLVED]);
/** A hospital accepted but the patient has not reached it: a cancel still tells the hospital and the crew. */
export const POST_ACCEPT = Object.freeze([S.ACCEPTED, S.AMBULANCE_ASSIGNED, S.EN_ROUTE]);
