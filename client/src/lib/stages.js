// Trip stages (feature 78). Mirror of server/src/services/tripStages.js.
export const STAGES = [
  { key: 'en_route', label: 'En route to patient' },
  { key: 'at_patient', label: 'At patient' },
  { key: 'patient_on_board', label: 'Patient on board' },
  { key: 'en_route_to_hospital', label: 'En route to hospital' },
  { key: 'at_hospital', label: 'At hospital' },
];

export const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

// done | current | upcoming, for drawing the tracker.
export function stageState(stageKey, key) {
  const cur = stageIndex(stageKey);
  const i = stageIndex(key);
  if (cur < 0 || i < 0) return 'upcoming';
  if (i < cur || (key === 'at_hospital' && cur === i)) return 'done';
  return i === cur ? 'current' : 'upcoming';
}

// What the crew can do right now. Movement stages are done by the simulator, so the crew waits.
export function crewAction(stageKey) {
  switch (stageKey) {
    case 'en_route': return { kind: 'wait', text: 'Driving to the patient…' };
    case 'at_patient': return { kind: 'pickup', text: 'Confirm patient pickup' };
    case 'patient_on_board': return { kind: 'wait', text: 'Leaving the scene…' };
    case 'en_route_to_hospital': return { kind: 'arrive', text: 'Confirm arrival at hospital' };
    case 'at_hospital': return { kind: 'done', text: 'Trip complete' };
    default: return { kind: 'wait', text: '' };
  }
}

export function formatEta(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '–';
  if (minutes < 1) return 'under 1 min';
  return `${Math.round(minutes)} min`;
}
