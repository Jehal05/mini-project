// Feature 26: scenarios. Each scenario turns a patient's baseline into target
// values; the engine glides from the current values toward the target, so a
// switch looks like a smooth physiological change rather than a jump.

import { SCENARIOS } from '../../../shared/emergency.js'

export { SCENARIOS }

export const SCENARIO_INFO = Object.freeze({
  stable: { label: 'Stable', description: "Resting around the patient's own baseline" },
  exercise: { label: 'Exercise', description: 'Light exercise: pulse, BP and breathing rise; recovers on Stable' },
  fever: { label: 'Fever', description: 'Temperature climbs towards 39 °C with a faster pulse' },
  hypoxia: { label: 'Hypoxia', description: 'Oxygen saturation falls; breathing and pulse rise' },
  cardiac_event: {
    label: 'Cardiac event',
    description: 'Fast pulse, falling SpO2, high BP and fast breathing (meets the multi-parameter rule)',
  },
})

/** Target vitals for a scenario, given the patient's baseline. */
export function scenarioTargets(scenario, b) {
  switch (scenario) {
    case 'exercise':
      // Light exercise. Pulse stays under the Critical bound and well inside the baseline limit,
      // so detection shows at most a Watch (Phase 6).
      return { hr: b.hr + 22, sys: b.sys + 20, dia: b.dia + 4, spo2: b.spo2 - 1.2, temp: b.temp + 0.4, rr: b.rr + 5 }
    case 'fever':
      return { hr: b.hr + 22, sys: b.sys - 4, dia: b.dia - 3, spo2: b.spo2 - 1, temp: 39.3, rr: b.rr + 5 }
    case 'hypoxia':
      return { hr: b.hr + 24, sys: b.sys + 6, dia: b.dia + 2, spo2: 86.5, temp: b.temp, rr: 27 }
    case 'cardiac_event':
      return { hr: 138, sys: 172, dia: 104, spo2: 86, temp: b.temp + 0.2, rr: 28 }
    case 'stable':
    default:
      return { ...b }
  }
}

export function isScenario(s) {
  return SCENARIOS.includes(s)
}
