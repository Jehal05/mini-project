// REST client for the SOS module (backend/src/emergency/routes.js).
import { API_URL, makeRequest } from '../monitoring/api.js'

const request = makeRequest(`${API_URL}/api/emergency`)
const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) })
const q = (v) => encodeURIComponent(v)

export const emergencyApi = {
  sos: (patient, location) => request('/sos', json('POST', { patient, ...(location && { location }) })),
  active: (patient) => request(`/active?patient=${q(patient)}`),
  mine: (patient, { page = 1, limit = 5 } = {}) => request(`/mine?patient=${q(patient)}&page=${page}&limit=${limit}`),
  firstAid: (patient) => request(`/first-aid?patient=${q(patient)}`),
  saveSymptoms: (caseId, symptoms) => request(`/${caseId}/symptoms`, json('PUT', { symptoms })),
  confirm: (caseId, symptoms) => request(`/${caseId}/confirm`, json('POST', { symptoms })),
  cancel: (caseId, reason, note) => request(`/${caseId}/cancel`, json('POST', { reason, ...(note && { note }) })),
  location: (caseId, location) => request(`/${caseId}/location`, json('PUT', location)),
  ack: (caseId, who) => request(`/${caseId}/ack`, json('POST', who)),
  // Family link: the token is the credential
  publicStatus: (token) => request(`/status/${q(token)}`),
  seen: (token) => request(`/status/${q(token)}/seen`, json('POST')),
}
