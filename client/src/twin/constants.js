// The few numbers the twin needs, copied from shared/vitals.js and shared/trends.js (the client cannot import that folder).
// twin.test.js compares them with the shared files, so they cannot drift.
export const VITAL_KEYS = Object.freeze(['hr', 'sys', 'dia', 'spo2', 'temp', 'rr']);
export const VITAL_DECIMALS = Object.freeze({ hr: 0, sys: 0, dia: 0, spo2: 0, temp: 1, rr: 0 });
export const TREND_MIN_CHANGE = Object.freeze({ hr: 3, sys: 5, dia: 4, spo2: 1, temp: 0.3, rr: 2 });
export const formatVital = (key, value) => (value === null || value === undefined ? '--' : Number(value).toFixed(VITAL_DECIMALS[key] ?? 0));
