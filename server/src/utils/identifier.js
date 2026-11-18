import { normalizePhone } from './phone.js';

/** Canonical form of what a user typed in the email/phone box. */
export function normalizeIdentifier(input) {
  const t = String(input).trim();
  if (t.includes('@')) return t.toLowerCase();
  return normalizePhone(t) ?? t.toLowerCase();
}

/**
 * What may be written to the audit log for a login attempt. People sometimes paste their password into
 * the email box, and audit entries can never be removed, so anything that is not clearly an email
 * address or a phone number is replaced.
 */
export function auditLabel(input) {
  const n = normalizeIdentifier(input);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n) && n.length <= 254) return n;
  if (/^\+\d{10,15}$/.test(n)) return n;
  return '[unrecognised identifier]';
}
