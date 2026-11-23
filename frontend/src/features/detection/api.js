// REST client for the detection module (backend/src/detection/routes.js).
import { API_URL, makeRequest } from '../monitoring/api.js'


const request = makeRequest(`${API_URL}/api/detection`)

export const detectionApi = {
  statuses: () => request('/status'),
  status: (id) => request(`/patients/${id}/status`),
  config: () => request('/config'),
  saveConfig: (body) => request('/config', { method: 'PUT', body: JSON.stringify(body) }),
  patientThresholds: (code) => request(`/patients/${encodeURIComponent(code)}/thresholds`),
  savePatientThresholds: (code, thresholds) => request(`/patients/${encodeURIComponent(code)}/thresholds`, { method: 'PUT', body: JSON.stringify({ thresholds }) }),
  detections: (id, { page = 1, limit = 8, severity } = {}) =>
    request(`/patients/${id}/detections?page=${page}&limit=${limit}${severity ? `&severity=${severity}` : ''}`),
}
