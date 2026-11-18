// REST client for the monitoring module (backend/src/simulation/routes.js).

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const BASE = `${API_URL}/api/sim`

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status })
  return body
}

export const monitoringApi = {
  listPatients: () => request('/patients'),
  getPatient: (idOrCode) => request(`/patients/${encodeURIComponent(idOrCode)}`),
  latest: (id) => request(`/patients/${id}/vitals/latest`),
  history: (id, range) => request(`/patients/${id}/vitals/history?range=${range}`),
  timeline: (id, range) => request(`/patients/${id}/timeline?range=${range}`),
  scenarios: () => request('/scenarios'),
  setScenario: (id, scenario) => request(`/patients/${id}/scenario`, { method: 'POST', body: JSON.stringify({ scenario }) }),
}
