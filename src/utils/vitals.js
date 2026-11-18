// Normal and critical ranges for each vital sign.
// Outside `normal` = warning, outside `critical` = critical.
export const VITALS = {
  hr: { label: 'Heart rate', unit: 'bpm', normal: [55, 105], critical: [45, 125] },
  spo2: { label: 'SpO₂', unit: '%', normal: [94, 100], critical: [90, 100] },
  sys: { label: 'Systolic BP', unit: 'mmHg', normal: [90, 140], critical: [80, 180] },
  dia: { label: 'Diastolic BP', unit: 'mmHg', normal: [60, 90], critical: [50, 110] },
  glucose: { label: 'Glucose', unit: 'mg/dL', normal: [70, 180], critical: [54, 300] },
  rr: { label: 'Resp. rate', unit: '/min', normal: [12, 22], critical: [8, 30] },
  temp: { label: 'Temperature', unit: '°C', normal: [36.1, 37.8], critical: [35, 39.5] },
}

const RANK = { normal: 0, warning: 1, critical: 2 }

export function vitalLevel(key, value) {
  const range = VITALS[key]
  if (!range) return 'normal'
  if (value < range.critical[0] || value > range.critical[1]) return 'critical'
  if (value < range.normal[0] || value > range.normal[1]) return 'warning'
  return 'normal'
}

export function patientLevel(vitals) {
  let worst = 'normal'
  for (const [key, value] of Object.entries(vitals)) {
    const level = vitalLevel(key, value)
    if (RANK[level] > RANK[worst]) worst = level
  }
  return worst
}

export function fmtVital(key, value) {
  return key === 'temp' ? value.toFixed(1) : String(Math.round(value))
}
