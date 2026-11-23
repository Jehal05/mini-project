// Mirrors the server's rules (server/src/utils/schemas.js). Letters and digits from any language count.
export const MAX_PASSWORD_BYTES = 72; // bcrypt only uses the first 72 bytes
export const byteLength = (s) => new TextEncoder().encode(s).length;

export const passwordRules = [
  { label: 'At least 8 characters', ok: (p) => p.length >= 8 },
  { label: 'A letter', ok: (p) => /\p{L}/u.test(p) },
  { label: 'A number', ok: (p) => /\p{N}/u.test(p) },
  { label: `At most ${MAX_PASSWORD_BYTES} bytes (accented and non-English letters count as 2 to 4)`, ok: (p) => byteLength(p) <= MAX_PASSWORD_BYTES, onlyWhenBroken: true },
];

export const passwordValid = (p) => passwordRules.every((r) => r.ok(p));
