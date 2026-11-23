// Input checks for patient records. Hand-written so no extra package is needed. Every check is strict:
// unknown keys (qrToken, consent, user, _id ...) are rejected, not ignored. Failures return { fields } for the form.
import { BLOOD_GROUPS, CARDIAC_TYPES, DOCUMENT_TYPES } from './constants.js';
import { normalizePhone } from '../utils/phone.js';
import { httpError } from '../utils/httpError.js';

export const SECTION_LIMIT = 50;
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const SEVERITIES = ['mild', 'moderate', 'severe'];

export function invalid(fields) {
  return Object.assign(httpError(400, 'Please check the highlighted fields'), { code: 'VALIDATION_ERROR', fields });
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// Each rule: (value) => cleaned value, or throws a string message.
const text = (label, max, { required = false } = {}) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  if (typeof v !== 'string') throw `${label} must be text`;
  const t = v.trim();
  if (t.length > max) throw `Use at most ${max} characters`;
  return t;
};
const oneOf = (label, list, { required = false } = {}) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  if (!list.includes(v)) throw `Choose one of: ${list.join(', ')}`;
  return v;
};
const dateRule = (label, { required = false } = {}) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1900) throw 'Enter a valid date';
  if (d.getTime() > Date.now() + 86400000) throw 'Date cannot be in the future';
  return d;
};
const intRule = (label, min, max, { required = false } = {}) => (v) => {
  if (blank(v)) { if (required) throw `${label} is required`; return undefined; }
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw `${label} must be a whole number from ${min} to ${max}`;
  return n;
};
const boolRule = () => (v) => { if (v === undefined) return undefined; if (typeof v !== 'boolean') throw 'Must be true or false'; return v; };
const phoneRule = (required) => (v) => {
  if (blank(v)) { if (required) throw 'Phone is required'; return undefined; }
  const n = normalizePhone(String(v));
  if (!n) throw 'Enter a valid phone number';
  return n;
};
const emailRule = () => (v) => {
  if (blank(v)) return undefined;
  const e = String(v).trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw 'Enter a valid email';
  return e;
};

/** Runs `rules` over `body`. `partial` = every field optional (PATCH) and at least one must be present. */
function run(body, rules, { partial = false } = {}) {
  if (!isObj(body)) throw invalid({ _: 'Send a JSON object' });
  const fields = {};
  const out = {};
  for (const k of Object.keys(body)) if (!(k in rules)) fields[k] = 'This field cannot be set here';
  for (const [k, rule] of Object.entries(rules)) {
    if (partial && !(k in body)) continue;
    try { const v = rule(body[k]); if (v !== undefined || (k in body && blank(body[k]))) out[k] = v; } catch (m) { if (typeof m !== 'string') throw m; fields[k] = m; }
  }
  if (!Object.keys(fields).length && partial && !Object.keys(body).length) fields._ = 'Nothing to update';
  if (Object.keys(fields).length) throw invalid(fields);
  return out;
}

const thisYear = () => new Date().getFullYear();

export const validatePersonal = (b) => {
  const v = run(b, {
    fullName: (x) => { const t = text('Name', 120)(x); if (t !== undefined && t.length < 2) throw 'Enter your full name'; return t; },
    dateOfBirth: dateRule('Date of birth'), gender: oneOf('Gender', GENDERS), address: text('Address', 300), city: text('City', 80),
    bloodGroup: oneOf('Blood group', BLOOD_GROUPS),
  }, { partial: true });
  return v;
};

export const validatePreferences = (b) => run(b, { email: boolRule(), webPush: boolRule(), whatsapp: boolRule(), locationConsent: boolRule() }, { partial: true });

const SECTION_RULES = {
  cardiacConditions: { type: oneOf('Type', CARDIAC_TYPES, { required: true }), year: intRule('Year', 1900, thisYear(), { required: true }), notes: text('Notes', 300) },
  medicalConditions: { name: text('Condition', 100, { required: true }), notes: text('Notes', 300) },
  allergies: { allergen: text('Allergen', 100, { required: true }), reaction: text('Reaction', 200), severity: oneOf('Severity', SEVERITIES, { required: true }) },
  medications: { drug: text('Drug', 100, { required: true }), dose: text('Dose', 50), frequency: text('Frequency', 50), isBloodThinner: boolRule() },
  hospitalizations: { hospital: text('Hospital', 120, { required: true }), admittedOn: dateRule('Admission date', { required: true }), dischargedOn: dateRule('Discharge date'), reason: text('Reason', 200) },
  familyHistory: { relative: text('Relative', 60, { required: true }), condition: text('Condition', 100, { required: true }), ageAtDiagnosis: intRule('Age', 0, 120) },
};
export const SECTIONS = Object.keys(SECTION_RULES);

function dischargeOrder(v) {
  if (v.admittedOn && v.dischargedOn && v.dischargedOn < v.admittedOn) throw invalid({ dischargedOn: 'Discharge cannot be before admission' });
}
export function validateSection(section, body, { partial }) {
  const rules = partial ? Object.fromEntries(Object.entries(SECTION_RULES[section]).map(([k, r]) => [k, (x) => (x === undefined ? undefined : r(x))])) : SECTION_RULES[section];
  // On create, an optional field that is blank is simply left out.
  const v = run(body, rules, { partial });
  if (section === 'hospitalizations') dischargeOrder(v);
  return v;
}

const contactRules = (create) => ({
  name: text('Name', 100, { required: create }), relation: text('Relation', 60, { required: create }),
  phone: phoneRule(create), email: emailRule(), ...(create ? { priority: intRule('Priority', 1, 3) } : {}),
});
export const validateContact = (b, { create }) => run(b, contactRules(create), { partial: !create });

export function validateContactOrder(b) {
  if (!isObj(b) || !Array.isArray(b.order) || Object.keys(b).length !== 1) throw invalid({ order: 'Send the list of contact ids' });
  const ids = b.order;
  if (ids.length < 1 || ids.length > 3 || ids.some((i) => !/^[a-f\d]{24}$/i.test(String(i)))) throw invalid({ order: 'Invalid contact id' });
  if (new Set(ids).size !== ids.length) throw invalid({ order: 'Each contact once' });
  return { order: ids.map(String) };
}

/** A file sent as JSON: { type?, name, data (base64) }. Returns the raw bytes, still unchecked. */
export function validateUpload(b, { needsType, maxBytes }) {
  const rules = { name: text('File name', 120), data: (v) => { if (typeof v !== 'string' || !v) throw 'Choose a file to upload'; return v; } };
  if (needsType) rules.type = oneOf('Type', DOCUMENT_TYPES, { required: true });
  const v = run(b, rules);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v.data) || v.data.length % 4 !== 0) throw invalid({ data: 'The file could not be read' });
  const buffer = Buffer.from(v.data, 'base64');
  if (!buffer.length) throw invalid({ data: 'Choose a file to upload' });
  if (buffer.length > maxBytes) throw Object.assign(httpError(413, `Files can be at most ${Math.floor(maxBytes / 1048576)} MB`), { code: 'FILE_TOO_LARGE' });
  return { ...v, buffer };
}

export function validateBystanderReport(b) {
  const num = (label, min, max, { required = false } = {}) => (v) => {
    if (blank(v)) { if (required) throw 'Location is required'; return undefined; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw `${label} is out of range`;
    return v;
  };
  return run(b, { latitude: num('Latitude', -90, 90, { required: true }), longitude: num('Longitude', -180, 180, { required: true }), accuracyMeters: num('Accuracy', 0, 1e6) });
}

export const isObjectIdString = (v) => /^[a-f\d]{24}$/i.test(String(v));
