import { blank, num, run, text } from '../inpatient/validate.js';
import { invalid } from '../inpatient/fields.js';
import { passwordProblems } from '../auth/password.js';

const phone = (v) => {
  if (blank(v)) return undefined;
  const compact = String(v).replace(/[\s().-]/g, '');
  if (/^\+?\d{8,15}$/.test(compact)) return compact;
  throw 'Enter a valid phone number';
};
const code = (v) => {
  if (blank(v)) throw 'Hospital code is required';
  const t = String(v).trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(t)) throw 'Use 3 to 20 letters, numbers or dashes';
  return t;
};
const email = (v) => {
  if (blank(v)) throw 'Email is required';
  const t = String(v).trim().toLowerCase();
  if (t.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw 'Enter a valid email address';
  return t;
};
const password = (v) => {
  const problems = passwordProblems(v);
  if (problems.length) throw problems.join(' ');
  return String(v);
};
const required = (rule, label) => (v) => { const out = rule(v); if (out === undefined) throw `${label} is required`; return out; };
const flag = (v) => { if (v === undefined) return undefined; if (typeof v !== 'boolean') throw 'Must be true or false'; return v; };

/** Feature 81 (central admin side): a new hospital and the account of its first administrator. */
export const validateHospitalRegistration = (b) => run(b, {
  code, name: text('Name', 120, true), address: text('Address', 200), area: text('Area', 80), phone,
  latitude: required(num('Latitude', -90, 90), 'Latitude'), longitude: required(num('Longitude', -180, 180), 'Longitude'),
  cathLab: flag, adminName: text('Administrator name', 120, true), adminEmail: email, adminPassword: password,
});

const dateOf = (label) => (v) => { if (blank(v)) return undefined; const d = new Date(v); if (Number.isNaN(d.getTime())) throw `${label} must be a date`; return d; };
/** Feature 98: filters for the audit log. */
export function validateAuditQuery(q) {
  const out = run(
    { action: q.action, q: q.q, from: q.from, to: q.to, page: q.page, limit: q.limit },
    { action: text('Action', 60), q: text('Search', 60), from: dateOf('From'), to: dateOf('To'), page: num('Page', 1, 100000), limit: num('Limit', 1, 100) },
  );
  return { page: 1, limit: 25, ...out };
}
export { invalid };
