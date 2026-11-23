import { presentPatient } from './patientSummary.js';

const num = (v) => (Number.isFinite(v) ? v : null);

/**
 * Feature 94: a short, template-built summary of a patient for a hospital (also used in the handover, feature 63).
 * Plain text from a fixed template; nothing is generated or guessed.
 *
 *   buildHealthSummary(patientDoc, { latest: { heartRate, systolic, diastolic, spo2, temperatureC, at }, baseline: { heartRate, spo2, ... } })
 *
 * `latest` and `baseline` are optional (Daksh's monitoring data, or the in-hospital vitals). Without them the summary says so.
 * Returns { text, lines, vitals } where `lines` is the same content split for display.
 */
export function buildHealthSummary(patient, { latest, baseline } = {}) {
  const p = presentPatient(patient);
  const lines = [];

  const who = [p.fullName, p.age !== undefined ? `${p.age} y` : null, p.gender, p.bloodGroup ? `blood group ${p.bloodGroup}` : null].filter(Boolean).join(', ');
  lines.push(`Patient: ${who} (${p.patientId}).`);

  const vitalsLine = [];
  if (latest) {
    const parts = [];
    if (num(latest.heartRate) !== null) parts.push(`heart rate ${latest.heartRate} bpm${trend(latest.heartRate, baseline?.heartRate, 'bpm')}`);
    if (num(latest.systolic) !== null && num(latest.diastolic) !== null) parts.push(`blood pressure ${latest.systolic}/${latest.diastolic} mmHg`);
    if (num(latest.spo2) !== null) parts.push(`SpO2 ${latest.spo2}%${trend(latest.spo2, baseline?.spo2, '%')}`);
    if (num(latest.temperatureC) !== null) parts.push(`temperature ${latest.temperatureC} °C`);
    if (parts.length) vitalsLine.push(`Latest vitals: ${parts.join(', ')}.`);
  }
  lines.push(vitalsLine[0] ?? 'Latest vitals: no readings on record.');

  const cardiac = p.cardiacConditions.map((c) => `${c.type.replace('_', ' ')}${c.year ? ` (${c.year})` : ''}`);
  lines.push(`Cardiac history: ${cardiac.length ? cardiac.join(', ') : 'none recorded'}.`);

  const allergies = p.allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}${a.severity === 'severe' ? ' - SEVERE' : ''}`);
  lines.push(`Allergies: ${allergies.length ? allergies.join(', ') : 'none recorded'}.`);

  const meds = p.medications.map((m) => `${m.drug}${m.dose ? ` ${m.dose}` : ''}${m.isBloodThinner ? ' [blood thinner]' : ''}`);
  lines.push(`Medicines: ${meds.length ? meds.join(', ') : 'none recorded'}.`);

  if (p.medicalConditions.length) lines.push(`Other conditions: ${p.medicalConditions.map((c) => c.name).join(', ')}.`);
  if (p.familyHistory.length) lines.push(`Family history: ${p.familyHistory.map((f) => `${f.relative}: ${f.condition}${f.ageAtDiagnosis !== undefined ? ` at ${f.ageAtDiagnosis}` : ''}`).join('; ')}.`);

  return { text: lines.join('\n'), lines, vitals: latest ?? null };
}

function trend(now, base, unit) {
  if (num(now) === null || num(base) === null) return '';
  const diff = Math.round((now - base) * 10) / 10;
  if (diff === 0) return ' (at baseline)';
  return ` (${diff > 0 ? '+' : ''}${diff} ${unit} vs baseline ${base})`;
}
