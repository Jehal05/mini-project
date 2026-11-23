// Password hashing with scrypt (built into Node). Format: scrypt$<salt>$<hash>, both base64url.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const OPTS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, OPTS);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const want = Buffer.from(hashB64, 'base64url');
  const got = await scrypt(password, Buffer.from(saltB64, 'base64url'), want.length, OPTS);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Rules shown to the person choosing a password.
export function passwordProblems(password) {
  const p = String(password ?? '');
  const out = [];
  if (p.length < 10) out.push('Use at least 10 characters.');
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p)) out.push('Use both upper and lower case letters.');
  if (!/\d/.test(p)) out.push('Include a number.');
  if (/^(.)\1+$/.test(p)) out.push('Do not repeat one character.');
  return out;
}
