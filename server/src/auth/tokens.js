// Signed access tokens (HS256 JWT) using only Node's crypto, so login needs no extra package.
// Same format as the `jsonwebtoken` package: Jehal's auth can replace this file without changing callers.
import crypto from 'node:crypto';

const b64 = (v) => Buffer.from(v).toString('base64url');
const HEADER = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const mac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export class TokenError extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 401; }
}

export function signJwt(payload, { secret, ttlSeconds, now = Date.now() }) {
  if (!secret) throw new Error('signJwt: secret is required');
  const iat = Math.floor(now / 1000);
  const body = b64(JSON.stringify({ ...payload, iat, exp: iat + ttlSeconds }));
  return `${HEADER}.${body}.${mac(`${HEADER}.${body}`, secret)}`;
}

export function verifyJwt(token, { secret, now = Date.now() }) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== HEADER) throw new TokenError('INVALID_TOKEN', 'Invalid access token');
  const given = Buffer.from(parts[2]);
  const want = Buffer.from(mac(`${parts[0]}.${parts[1]}`, secret));
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new TokenError('INVALID_TOKEN', 'Invalid access token');
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw new TokenError('INVALID_TOKEN', 'Invalid access token'); }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) throw new TokenError('TOKEN_EXPIRED', 'Access token expired');
  return payload;
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
