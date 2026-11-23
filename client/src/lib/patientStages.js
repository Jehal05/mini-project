// The five steps a patient sees (Patient screen). Plain language, no jargon.
export const PATIENT_STEPS = [
  { id: 'alert', label: 'Alert sent', say: 'We have alerted nearby hospitals. Stay where you are and keep calm.' },
  { id: 'accepted', label: 'Hospital accepted', say: 'A hospital has accepted your emergency and is getting ready for you.' },
  { id: 'dispatched', label: 'Ambulance dispatched', say: 'An ambulance is on its way to you. Stay where you are.' },
  { id: 'onway', label: 'On the way to hospital', say: 'You are on your way to the hospital. The team there is ready.' },
  { id: 'arrived', label: 'Arrived', say: 'You have arrived. The hospital team has taken over.' },
];

// Step index 0..4 from the case status and the trip stage (either may be missing).
export function patientStep({ caseStatus, tripStage } = {}) {
  if (tripStage === 'at_hospital' || caseStatus === 'arrived' || caseStatus === 'closed') return 4;
  if (tripStage === 'patient_on_board' || tripStage === 'en_route_to_hospital' || caseStatus === 'en_route') return 3;
  if (tripStage === 'en_route' || tripStage === 'at_patient' || caseStatus === 'ambulance_assigned') return 2;
  if (caseStatus === 'accepted') return 1;
  return 0;
}
