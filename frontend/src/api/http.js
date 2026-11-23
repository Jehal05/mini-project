const BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export class ApiRequestError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// The access token lives only in memory (never localStorage), so scripts on the page cannot steal it.
let accessToken = null;
let refreshInFlight = null;
let onAuthLost = () => {};

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token; };
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

async function send(path, { method = 'GET', body, form, as = 'json', auth = true } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && !form && { 'Content-Type': 'application/json' }),
        'X-Requested-With': 'healthtwin',
        ...(auth && accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined), // FormData sets its own content type
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.ok && as === 'blob') return res.blob();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiRequestError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

const RACE_RETRY_MS = 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestRefresh() {
  try {
    return await send('/auth/refresh', { method: 'POST', auth: false });
  } catch (err) {
    // Another tab renewed the session a moment before us. The browser now holds the new cookie, so retry once.
    if (err instanceof ApiRequestError && err.code === 'REFRESH_RACE') {
      await sleep(RACE_RETRY_MS);
      return send('/auth/refresh', { method: 'POST', auth: false });
    }
    throw err;
  }
}

/** Feature 100: exchanges the httpOnly refresh cookie for a new access token. One call at a time. */
export function refreshSession() {
  refreshInFlight ??= requestRefresh()
    .then((data) => { accessToken = data.accessToken; return data; })
    .catch((err) => { accessToken = null; throw err; })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

// An access token that expired, or whose login was just rotated, is worth one silent refresh and retry.
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'SESSION_REVOKED']);

/** Calls the API; if the access token has expired, refreshes silently once and retries. */
export async function api(path, options = {}) {
  try {
    return await send(path, options);
  } catch (err) {
    if (!(err instanceof ApiRequestError) || !REFRESHABLE.has(err.code) || options.auth === false) throw err;
    try {
      await refreshSession();
    } catch (refreshErr) {
      onAuthLost(refreshErr);
      throw err;
    }
    return send(path, options);
  }
}

export const post = (path, body, options) => api(path, { method: 'POST', body: body ?? {}, ...options });
export const patch = (path, body, options) => api(path, { method: 'PATCH', body, ...options });
export const put = (path, body, options) => api(path, { method: 'PUT', body: body ?? {}, ...options });
export const del = (path, options) => api(path, { method: 'DELETE', ...options });
/** Multipart upload (photo, documents). The browser sets the boundary, so no JSON content type. */
export const upload = (path, form, method = 'POST') => api(path, { method, form });
/** Downloads a protected file with the bearer token, for preview (a plain <img src> cannot send it). */
export const getBlob = (path, options) => api(path, { as: 'blob', ...options });
