import { VITAL_DEFS, classifyVital } from '../ui/vitals.js';

// Where each metric's callout sits around the hologram (percent of the picture) and which side its label is on.
const SPOTS = {
  heartRate: { from: [48, 55], side: 'left', top: 6 },
  systolic: { from: [58, 40], side: 'right', top: 6 },
  spo2: { from: [42, 66], side: 'left', top: 64 },
  respiratoryRate: { from: [60, 62], side: 'right', top: 64 },
};

/** Out-of-range readings only (the callouts). Real readings from the case, simulated ranges. Nothing is made up. */
export function findings(vitals) {
  if (!vitals) return [];
  return Object.keys(SPOTS).flatMap((key) => {
    const value = vitals[key];
    const status = classifyVital(key, value);
    if (status === 'normal' || status === 'unknown') return [];
    const def = VITAL_DEFS[key];
    const [lo, hi] = def.normal;
    return [{ key, label: def.label, unit: def.unit, value, status, tone: status === 'critical' ? 'alert' : 'warning', direction: value < lo ? 'below' : 'above', range: `${lo} to ${hi}`, ...SPOTS[key] }];
  });
}

/** Plain sentences for the "Simulated analysis" card: only restates which readings are outside the demo ranges. No score, no diagnosis. */
export function simulatedAnalysis(vitals) {
  if (!vitals) return ['No readings yet.'];
  const f = findings(vitals);
  if (!f.length) return ['All readings are inside the demo ranges.'];
  return f.map((x) => `${x.label} is ${x.direction} the demo range (${x.value} ${x.unit}, range ${x.range}).`);
}
