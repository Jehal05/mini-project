// The trip state machine (feature 78). Stages only move forward, one step at a time.
import { httpError } from '../utils/httpError.js';

export const STAGES = ['en_route', 'at_patient', 'patient_on_board', 'en_route_to_hospital', 'at_hospital'];

export const STAGE_LABELS = {
  en_route: 'En route to patient',
  at_patient: 'At patient',
  patient_on_board: 'Patient on board',
  en_route_to_hospital: 'En route to hospital',
  at_hospital: 'At hospital',
};

// Who moves the trip into each stage: the simulator (physical arrival and departure) or a person.
export const STAGE_TRIGGER = {
  en_route: 'dispatch',
  at_patient: 'simulator',
  patient_on_board: 'crew',
  en_route_to_hospital: 'simulator',
  at_hospital: 'crew_or_ed',
};

export const nextStage = (stage) => STAGES[STAGES.indexOf(stage) + 1] ?? null;
export const canTransition = (from, to) => STAGES.indexOf(from) >= 0 && STAGES.indexOf(to) === STAGES.indexOf(from) + 1;
export const isMovingStage = (stage) => stage === 'en_route' || stage === 'en_route_to_hospital';

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const next = nextStage(from);
    throw httpError(409, `Cannot move from ${from} to ${to}. ${next ? `The next stage is ${next}.` : 'The trip is finished.'}`);
  }
}
