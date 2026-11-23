import { blank, id24, num, oneOf, run, text } from '../inpatient/validate.js';
import { invalid } from '../inpatient/fields.js';

export const SPECIALTIES = Object.freeze(['cardiologist', 'emergency', 'other']);
export const HISTORY_FILTERS = Object.freeze(['all', 'accepted', 'rejected', 'no_answer', 'elsewhere', 'cancelled']);
export const BAY_ACTIONS = Object.freeze(['occupy', 'clear', 'ready']);

// Hospital lines are often landlines with an STD code (020 2000 0000), so those are accepted as well as mobiles.
const phone = (v) => {
  if (blank(v)) return undefined;
  if (typeof v !== 'string') throw 'Enter a valid phone number';
  const compact = v.replace(/[\s().-]/g, '');
  if (/^\+?\d{8,15}$/.test(compact)) return compact;
  throw 'Enter a valid phone number';
};
const bool = (label) => (v) => { if (v === undefined) return undefined; if (typeof v !== 'boolean') throw `${label} must be true or false`; return v; };
const atLeastOne = (v) => { if (!Object.keys(v).length) throw invalid({ _: 'Nothing to change' }); return v; };

/** What a hospital admin may change about their own hospital. */
export const validateProfile = (b) => atLeastOne(run(b, { phone, cathLab: bool('Cath lab') }));
export const validateDoctorCreate = (b) => run(b, { name: text('Name', 120, true), specialty: oneOf('Specialty', SPECIALTIES, true), phone, onDuty: bool('On duty') });
export const validateDoctorUpdate = (b) => atLeastOne(run(b, { name: text('Name', 120), specialty: oneOf('Specialty', SPECIALTIES), phone, onDuty: bool('On duty'), isActive: bool('Active') }));
export const validateBay = (b) => run(b, { label: text('Label', 30, true) });
export const validateBayAction = (b) => {
  const base = run({ action: b?.action }, { action: oneOf('Action', BAY_ACTIONS, true) });
  if (base.action !== 'occupy') { run(b, { action: () => base.action }); return base; }
  const v = run(b, {
    action: () => 'occupy',
    patientId: (x) => { if (blank(x)) return undefined; const t = String(x).trim().toUpperCase(); if (!/^HT-\d{4}-\d{4,}$/.test(t)) throw 'Enter a patient ID like HT-2026-0001'; return t; },
    triageLevel: (x) => { const n = num('Triage level', 1, 5)(x); if (n === undefined || !Number.isInteger(n)) throw 'Triage level is a whole number from 1 to 5'; return n; },
    complaint: text('Complaint', 200),
  });
  return v;
};
export const validateHistoryQuery = (q = {}) => {
  const filter = q.status === undefined || q.status === '' ? 'all' : q.status;
  if (!HISTORY_FILTERS.includes(filter)) throw invalid({ status: `Choose one of: ${HISTORY_FILTERS.join(', ')}` });
  const page = q.page === undefined ? 1 : Number(q.page);
  const limit = q.limit === undefined ? 25 : Number(q.limit);
  if (!Number.isInteger(page) || page < 1) throw invalid({ page: 'Page is a whole number from 1' });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid({ limit: 'Limit is a whole number from 1 to 100' });
  return { status: filter, page, limit };
};
export { id24 };
