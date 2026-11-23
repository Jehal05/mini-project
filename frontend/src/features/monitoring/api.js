// REST client for the monitoring module (backend/src/simulation/routes.js).
import { getAccessToken, refreshSession } from '../../api/http.js'

// Empty by default: the dev server proxies /api and /socket.io to the backend (vite.config.js).
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const BASE = `${API_URL}/api/sim`

// INTERIM presenter key (review item 3). Kept for this browser tab only.
// TODO(Jehal): remove when the presenter page uses the real login + central_admin role.
export const PRESENTER_KEY_HEADER = 'x-presenter-key'
const KEY_STORAGE = 'ht-presenter-key'

export const presenterKey = {
  get() {
    try {
      return sessionStorage.getItem(KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  },
  set(value) {
    try {
      if (value) sessionStorage.setItem(KEY_STORAGE, value)
      else sessionStorage.removeItem(KEY_STORAGE)
    } catch {
      /* storage unavailable: the key is simply not remembered */
    }
  },
}

/** A fetch helper for one API area, e.g. makeRequest(`${API_URL}/api/detection`). */
// Codes that mean "the login token ran out": renew it once and try again (same rule as api/http.js).
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'SESSION_REVOKED'])

/** A fetch helper for one API area, e.g. makeRequest(`${API_URL}/api/detection`). Sends the login token. */
export const makeRequest = (base) => async function request(path, { headers, ...options } = {}, retried = false) {
  const token = getAccessToken()
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    credentials: 'include',
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = body.code ?? body.error?.code
    if (res.status === 401 && !retried && REFRESHABLE.has(code)) {
      try {
        await refreshSession()
        return request(path, { headers, ...options }, true)
      } catch {
        /* the session is over: fall through to the original error */
      }
    }
    const message = typeof body.error === 'string' ? body.error : body.error?.message
    throw Object.assign(new Error(message ?? `Request failed (${res.status})`), { status: res.status, code, errors: body.errors })
  }
  return body
}

const request = makeRequest(BASE)

export const monitoringApi = {
  listPatients: () => request('/patients'),
  getPatient: (idOrCode) => request(`/patients/${encodeURIComponent(idOrCode)}`),
  latest: (id) => request(`/patients/${id}/vitals/latest`),
  history: (id, range) => request(`/patients/${id}/vitals/history?range=${range}`),
  trends: (id) => request(`/patients/${id}/trends`),
  timeline: (id, range) => request(`/patients/${id}/timeline?range=${range}`),
  scenarios: () => request('/scenarios'),
  setScenario: (id, scenario) => {
    const key = presenterKey.get()
    return request(`/patients/${id}/scenario`, {
      method: 'POST',
      body: JSON.stringify({ scenario }),
      headers: key ? { [PRESENTER_KEY_HEADER]: key } : undefined,
    })
  },
}
