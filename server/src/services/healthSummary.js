// Feature 94: the short health summary sent in the hospital handover (63). Built from a fixed template, not written by a model:
// latest vitals against the patient's own baseline, the trend, cardiac history, allergies and medicines.
import { TREND_MIN_CHANGE } from '../../../shared/trends.js';
import { DEFAULT_THRESHOLDS, vitalStatus } from '../../../shared/vitals.js';

const KEYS = ['hr', 'sys', 'dia', 'spo2', 'temp', 'rr'];
const HEART = { heart_attack: 'heart attack', stent: 'stent', bypass: 'bypass surgery', arrhythmia: 'arrhythmia', heart_failure: 'heart failure', other: 'other heart condition' };
const fmt = (key, v) => `${Number(v).toFixed(DEFAULT_THRESHOLDS[key].decimals)} ${DEFAULT_THRESHOLDS[key].unit}`;
const SHORT = { hr: 'Heart rate', sys: 'Systolic BP', dia: 'Diastolic BP', spo2: 'SpO2', temp: 'Temperature', rr: 'Respiratory rate' };

/** Rising, falling or steady from the older and newer half of the readings (oldest first). Null with fewer than 6 readings. */
export function trendOf(values, key) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (v.length < 6) return null;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const half = Math.floor(v.length / 2);
  const change = mean(v.slice(-half)) - mean(v.slice(0, half));
  const min = TREND_MIN_CHANGE[key];
  return change >= min ? 'rising' : change <= -min ? 'falling' : 'steady';
}

/**
 * @param patient  Patient record (cardiacConditions, allergies, medications)
 * @param latest   latest reading { hr, sys, dia, spo2, temp, rr } or null
 * @param recent   recent readings, oldest first, same keys
 * @param baseline the patient's own usual values, same keys (optional)
 */
export function buildHealthSummary({ patient = {}, latest = null, recent = [], baseline = null } = {}) {
  const lines = [];
  const vitals = [];
  if (latest) {
    for (const key of KEYS) {
      const value = latest[key];
      if (typeof value !== 'number') continue;
      const status = vitalStatus(key, value);
      const trend = trendOf(recent.map((r) => r[key]), key);
      const base = baseline?.[key];
      const diff = typeof base === 'number' ? value - base : null;
      vitals.push({ key, label: SHORT[key], value, text: fmt(key, value), status, trend, baseline: base ?? null, diff });
    }
    const flagged = vitals.filter((v) => v.status !== 'normal');
    lines.push(flagged.length
      ? `Latest vitals outside the normal range: ${flagged.map((v) => `${v.label} ${v.text} (${v.status}${v.trend ? `, ${v.trend}` : ''}${v.diff !== null ? `, ${v.diff >= 0 ? '+' : ''}${v.diff.toFixed(DEFAULT_THRESHOLDS[v.key].decimals)} from the patient's usual` : ''})`).join('; ')}.`
      : 'Latest vitals are all in the normal range.');
    const calm = vitals.filter((v) => v.status === 'normal').map((v) => `${v.label} ${v.text}`);
    if (calm.length && flagged.length) lines.push(`Normal: ${calm.join(', ')}.`);
  } else lines.push('No vital signs have been recorded for this patient.');

  const cardiac = (patient.cardiacConditions ?? []).map((c) => `${HEART[c.type] ?? c.type}${c.year ? ` (${c.year})` : ''}`);
  lines.push(cardiac.length ? `Cardiac history: ${cardiac.join(', ')}.` : 'Cardiac history: none recorded.');
  const allergies = (patient.allergies ?? []).map((a) => `${a.allergen}${a.severity ? ` (${a.severity})` : ''}`);
  lines.push(allergies.length ? `Allergies: ${allergies.join(', ')}.` : 'Allergies: none recorded.');
  const meds = (patient.medications ?? []).map((m) => `${m.drug}${m.dose ? ` ${m.dose}` : ''}${m.isBloodThinner ? ' [blood thinner]' : ''}`);
  lines.push(meds.length ? `Medicines: ${meds.join(', ')}.` : 'Medicines: none recorded.');
  return { text: lines.join(' '), lines, vitals, generated: 'template', simulated: true };
}
