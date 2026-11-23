// Pure helpers for the patient record screens (no network, no React), so they are easy to test.

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const DOCUMENT_TYPES = [
  ['ecg', 'ECG'], ['lab_report', 'Lab report'], ['prescription', 'Prescription'], ['discharge_summary', 'Discharge summary'],
  ['imaging', 'Imaging'], ['insurance', 'Insurance'], ['other', 'Other'],
];
export const docTypeLabel = (t) => DOCUMENT_TYPES.find(([id]) => id === t)?.[1] ?? t;

const CARDIAC = [['heart_attack', 'Heart attack'], ['stent', 'Stent'], ['bypass', 'Bypass'], ['arrhythmia', 'Arrhythmia'], ['heart_failure', 'Heart failure'], ['other', 'Other']];
const SEVERITY = [['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']];

// One entry per medical list. kind: text | number | date | select | check. `title` makes the one-line summary of a row.
export const SECTIONS = {
  cardiacConditions: { label: 'Heart conditions', noun: 'heart condition', fields: [
    { key: 'type', label: 'Type', kind: 'select', options: CARDIAC, required: true },
    { key: 'year', label: 'Year', kind: 'number', required: true }, { key: 'notes', label: 'Notes', kind: 'text' }],
    title: (i) => `${CARDIAC.find(([id]) => id === i.type)?.[1] ?? i.type}${i.year ? `, ${i.year}` : ''}`, detail: (i) => i.notes },
  medicalConditions: { label: 'Other conditions', noun: 'condition', fields: [
    { key: 'name', label: 'Condition', kind: 'text', required: true }, { key: 'notes', label: 'Notes', kind: 'text' }],
    title: (i) => i.name, detail: (i) => i.notes },
  allergies: { label: 'Allergies', noun: 'allergy', fields: [
    { key: 'allergen', label: 'Allergen', kind: 'text', required: true }, { key: 'reaction', label: 'Reaction', kind: 'text' },
    { key: 'severity', label: 'Severity', kind: 'select', options: SEVERITY, required: true }],
    title: (i) => i.allergen, detail: (i) => i.reaction, badge: (i) => ({ text: i.severity, tone: i.severity === 'severe' ? 'critical' : i.severity === 'moderate' ? 'moderate' : 'neutral' }) },
  medications: { label: 'Medicines', noun: 'medicine', fields: [
    { key: 'drug', label: 'Medicine', kind: 'text', required: true }, { key: 'dose', label: 'Dose', kind: 'text' },
    { key: 'frequency', label: 'How often', kind: 'text' }, { key: 'isBloodThinner', label: 'This is a blood thinner', kind: 'check' }],
    title: (i) => i.drug, detail: (i) => [i.dose, i.frequency].filter(Boolean).join(', '), badge: (i) => (i.isBloodThinner ? { text: 'blood thinner', tone: 'critical' } : null) },
  hospitalizations: { label: 'Hospital stays', noun: 'hospital stay', fields: [
    { key: 'hospital', label: 'Hospital', kind: 'text', required: true }, { key: 'admittedOn', label: 'Admitted on', kind: 'date', required: true },
    { key: 'dischargedOn', label: 'Discharged on', kind: 'date' }, { key: 'reason', label: 'Reason', kind: 'text' }],
    title: (i) => i.hospital, detail: (i) => [dayOf(i.admittedOn), i.dischargedOn && `to ${dayOf(i.dischargedOn)}`, i.reason].filter(Boolean).join(' '), badge: (i) => (i.byHospital ? { text: 'added by hospital', tone: 'neutral' } : null) },
  familyHistory: { label: 'Family history', noun: 'family condition', fields: [
    { key: 'relative', label: 'Relative', kind: 'text', required: true }, { key: 'condition', label: 'Condition', kind: 'text', required: true },
    { key: 'ageAtDiagnosis', label: 'Age at diagnosis', kind: 'number' }],
    title: (i) => `${i.relative}: ${i.condition}`, detail: (i) => (i.ageAtDiagnosis != null ? `diagnosed at ${i.ageAtDiagnosis}` : '') },
};
export const SECTION_ORDER = Object.keys(SECTIONS);

export const dayOf = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Form values -> request body. Numbers become numbers; blank optional fields are sent as '' so the server clears them. */
export function toBody(fields, values, { forUpdate = false } = {}) {
  const body = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (f.kind === 'check') { body[f.key] = Boolean(raw); continue; }
    const blank = raw === undefined || raw === null || String(raw).trim() === '';
    if (blank) { if (forUpdate && !f.required) body[f.key] = ''; continue; }
    body[f.key] = f.kind === 'number' ? Number(raw) : f.kind === 'date' ? String(raw).slice(0, 10) : String(raw).trim();
  }
  return body;
}

/** Item from the server -> form values. */
export function toValues(fields, item = {}) {
  return Object.fromEntries(fields.map((f) => [f.key, f.kind === 'check' ? Boolean(item[f.key]) : f.kind === 'date' ? dayOf(item[f.key]) : item[f.key] ?? '']));
}

/** A pasted link or bare token -> the 64-hex token, or null. */
export function passportTokenFrom(input) {
  const m = String(input ?? '').trim().match(/([a-f0-9]{64})\/?(?:[?#].*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

export const initials = (name) => String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Message for a file the browser can check before upload; null when fine. The server checks the real bytes again. */
export function fileProblem(file, { maxBytes, types }) {
  if (!file) return 'Choose a file';
  if (file.size > maxBytes) return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  if (types && !types.includes(file.type)) return 'That file type is not accepted.';
  return null;
}

export const phoneForDisplay = (p) => String(p ?? '').replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
