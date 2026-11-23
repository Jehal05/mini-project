
export const WARDS = Object.freeze(['ICU', 'CCU', 'ED', 'GENERAL']);
export const BED_STATES = Object.freeze(['free', 'occupied', 'reserved', 'cleaning']);
import { invalid } from './fields.js';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export const text = (label, max, required) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  if (typeof v !== 'string') throw `${label} must be text`;
  const t = v.trim();
  if (t.length > max) throw `Use at most ${max} characters`;
  return t;
};
export const oneOf = (label, list, required) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  if (!list.includes(v)) throw `Choose one of: ${list.join(', ')}`;
  return v;
};
export const id24 = (label, required) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  if (!/^[a-f\d]{24}$/i.test(String(v))) throw `${label} is not valid`;
  return String(v);
};
export const num = (label, min, max) => (v) => {
  if (blank(v)) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw `${label} must be between ${min} and ${max}`;
  return n;
};

export function run(body, rules) {
  if (!isObj(body)) throw invalid({ _: 'Send a JSON object' });
  const out = {}; const fields = {};
  for (const k of Object.keys(body)) if (!(k in rules)) fields[k] = 'This field cannot be set here';
  for (const [k, rule] of Object.entries(rules)) { try { const v = rule(body[k]); if (v !== undefined) out[k] = v; } catch (m) { if (typeof m !== 'string') throw m; fields[k] = m; } }
  if (Object.keys(fields).length) throw invalid(fields);
  return out;
}

export const validateBed = (b) => run(b, { ward: oneOf('Ward', WARDS, true), label: text('Label', 30, true) });
export const validateBedState = (b) => run(b, { status: oneOf('Status', ['free', 'reserved', 'cleaning'], true) }); // "occupied" only happens by admitting someone
export const validateAdmit = (b) => run(b, { patientId: text('Patient ID', 30, true), bedId: id24('Bed', true), doctorId: id24('Doctor', true), reason: text('Reason', 300) });
export const validateNote = (b) => {
  if (!isObj(b)) throw invalid({ _: 'Send a JSON object' });
  if (b.kind === 'note') return { kind: 'note', ...run({ text: b.text }, { text: text('Note', 4000, true) }) };
  if (b.kind === 'vitals') {
    const { kind, ...rest } = b;
    const v = run(rest, { heartRate: num('Heart rate', 20, 260), systolic: num('Systolic', 40, 280), diastolic: num('Diastolic', 20, 200), spo2: num('SpO2', 50, 100), temperatureC: num('Temperature', 30, 45) });
    if (!Object.keys(v).length) throw invalid({ _: 'Enter at least one reading' });
    return { kind: 'vitals', ...v };
  }
  throw invalid({ kind: 'Choose note or vitals' });
};
export const validatePrescription = (b) => {
  const out = run(b, { drug: text('Drug', 120, true), dose: text('Dose', 60, true), frequency: text('Frequency', 60, true), duration: text('Duration', 60, true), acknowledgeAllergy: (v) => v === true });
  return out;
};
export const validateDischarge = (b) => {
  const out = run(b, { diagnosis: text('Diagnosis', 500, true), treatment: text('Treatment', 2000, true), followUp: text('Follow-up', 500), medicines: (v) => v });
  const meds = out.medicines ?? [];
  if (!Array.isArray(meds) || meds.length > 30) throw invalid({ medicines: 'Send a list of at most 30 medicines' });
  out.medicines = meds.map((m, i) => {
    try { return run(m, { drug: text('Drug', 120, true), dose: text('Dose', 60), frequency: text('Frequency', 60), duration: text('Duration', 60) }); } catch (e) { throw invalid({ [`medicines.${i}`]: Object.values(e.fields ?? { _: 'Not valid' })[0] }); }
  });
  return out;
};
