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

async function send(path, { method = 'GET', body, auth = true } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        'X-Requested-With': 'healthtwin',
        ...(auth && accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiRequestError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

/** Feature 100: exchanges the httpOnly refresh cookie for a new access token. One call at a time. */
export function refreshSession() {
  refreshInFlight ??= send('/auth/refresh', { method: 'POST', auth: false })
    .then((data) => { accessToken = data.accessToken; return data; })
    .catch((err) => { accessToken = null; throw err; })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/** Calls the API; if the access token has expired, refreshes silently once and retries. */
export async function api(path, options = {}) {
  try {
    return await send(path, options);
  } catch (err) {
    if (!(err instanceof ApiRequestError) || err.code !== 'TOKEN_EXPIRED' || options.auth === false) throw err;
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
