// REST client for the monitoring module (backend/src/simulation/routes.js).

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
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

async function request(path, { headers, ...options } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status, code: body.code })
  }
  return body
}

export const monitoringApi = {
  listPatients: () => request('/patients'),
  getPatient: (idOrCode) => request(`/patients/${encodeURIComponent(idOrCode)}`),
  latest: (id) => request(`/patients/${id}/vitals/latest`),
  history: (id, range) => request(`/patients/${id}/vitals/history?range=${range}`),
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
