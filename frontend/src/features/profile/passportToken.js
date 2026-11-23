const TOKEN = /^[a-f0-9]{64}$/;

/** Accepts a scanned QR URL or a bare token and returns the 64-character token, or null. Never throws. */
export function parsePassportToken(text) {
  const value = String(text ?? '').trim();
  if (TOKEN.test(value)) return value;
  try {
    const url = new URL(value);
    const m = url.pathname.match(/^\/p\/([a-f0-9]{64})\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
