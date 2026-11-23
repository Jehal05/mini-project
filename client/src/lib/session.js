// Session for the signed-in person. Access token in memory; the refresh token is an httpOnly cookie the browser holds.
import { CSRF, headersFor } from './authHeaders.js';

let token = null;
let user = null;
let status = 'loading'; // loading | out | in
let refreshing = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
export const getSession = () => ({ status, user });
export const getToken = () => token;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function set(next) { token = next.token; user = next.user; status = next.status; emit(); }

async function postAuth(path, body) {
  let res;
  try {
    res = await fetch(`/api/auth${path}`, { method: 'POST', credentials: 'include', headers: { ...CSRF, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('network'); e.status = 0; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.code = data.code; throw e; }
  return data;
}

export async function signIn(portal, email, password) {
  const data = await postAuth(`/login/${portal}`, { email, password });
  set({ token: data.accessToken, user: data.user, status: 'in' });
  return data.user;
}

// Feature 1: a patient creates their own account, then is signed in. Throws an error with .fields for the form.
export async function register({ name, email, password, consentDataUse, consentLocation }) {
  let res;
  try { res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, consentDataUse, consentLocation }) }); }
  catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0, fields: {} }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code, fields: data.fields ?? {} });
  return signIn('patient', email, password);
}

// Called once at start: the cookie (if any) gets a new access token without asking for a password.
export async function restore() {
  try {
    const data = await postAuth('/refresh');
    set({ token: data.accessToken, user: data.user, status: 'in' });
  } catch { set({ token: null, user: null, status: 'out' }); }
}

export async function signOut() {
  try { await postAuth('/logout'); } catch { /* the cookie is cleared by the server when it can be reached */ }
  set({ token: null, user: null, status: 'out' });
}

// One refresh at a time, even when several requests hit an expired token together.
function refreshOnce() {
  refreshing ??= postAuth('/refresh')
    .then((d) => { set({ token: d.accessToken, user: d.user, status: 'in' }); return true; })
    .catch(() => { set({ token: null, user: null, status: 'out' }); return false; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** fetch with the Bearer token (or the old dev headers in demo mode). Retries once after refreshing an expired token. */
export async function authedFetch(url, { method = 'GET', body, legacy = {} } = {}) {
  const run = () => fetch(url, { method, credentials: 'include', headers: headersFor(token, legacy, Boolean(body)), body: body ? JSON.stringify(body) : undefined });
  let res = await run();
  if (res.status === 401 && token && (await refreshOnce())) res = await run();
  return res;
}

// Feature 7: forgot password. The answer is the same whether or not the email has an account.
async function plainPost(path, body) {
  let res;
  try { res = await fetch(`/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code });
  return data;
}
export const requestPasswordReset = (email) => plainPost('/forgot', { email });
export const resetPassword = (token, password) => plainPost('/reset', { token, password });
export const resetTokenFromUrl = (search = window.location.search) => new URLSearchParams(search).get('reset');
