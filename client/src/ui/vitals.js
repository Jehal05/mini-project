// Vitals range classification (Doctor and Hospital screens).
// IMPORTANT: these thresholds are SIMULATED, chosen only so the demo highlights out-of-range values.
// They are not clinical advice and must not be used to make medical decisions.
export const RANGE_NOTE = 'Highlight ranges are simulated for this demo and are not clinical advice.';

export const VITAL_DEFS = {
  heartRate: { label: 'Heart rate', unit: 'bpm', normal: [60, 100], warning: [50, 119] },
  systolic: { label: 'Systolic pressure', unit: 'mmHg', normal: [100, 139], warning: [90, 179] },
  diastolic: { label: 'Diastolic pressure', unit: 'mmHg', normal: [60, 89], warning: [50, 109] },
  spo2: { label: 'SpO₂', unit: '%', normal: [95, 100], warning: [90, 100] },
  respiratoryRate: { label: 'Respiratory rate', unit: '/min', normal: [12, 20], warning: [10, 24] },
};

// 'normal' | 'warning' | 'critical' | 'unknown'
export function classifyVital(metric, value) {
  const def = VITAL_DEFS[metric];
  if (!def || typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
  if (value >= def.normal[0] && value <= def.normal[1]) return 'normal';
  if (value >= def.warning[0] && value <= def.warning[1]) return 'warning';
  return 'critical';
}

const ORDER = { unknown: 0, normal: 1, warning: 2, critical: 3 };
export function overallVitals(vitals) {
  if (!vitals) return 'unknown';
  return Object.keys(VITAL_DEFS).map((k) => classifyVital(k, vitals[k])).reduce((a, b) => (ORDER[b] > ORDER[a] ? b : a), 'unknown');
}

export const VITAL_TONE = { normal: 'low', warning: 'moderate', critical: 'critical', unknown: 'neutral' };
export const VITAL_WORD = { normal: 'In range', warning: 'Outside range', critical: 'Far outside range', unknown: 'No reading' };
