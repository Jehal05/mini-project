import { api, patch, post, put } from '../../api/http.js'

const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== false)).toString()

export const responseApi = {
  nearby: (params) => api(`/hospitals/nearby?${q(params)}`),
  geocode: (text) => api(`/geocode?${q({ q: text })}`),
  track: (caseId) => api(`/response/track/${caseId}`),
  incoming: () => api('/response/incoming'),
  caseFor: (id) => api(`/response/cases/${id}`),
  accept: (id) => post(`/response/cases/${id}/accept`),
  reject: (id, reason, note) => post(`/response/cases/${id}/reject`, { reason, ...(note && { note }) }),
  assignDoctor: (id, doctorId) => post(`/response/cases/${id}/doctor`, { doctorId }),
  prepare: (id, patchBody) => put(`/response/cases/${id}/preparation`, patchBody),
  assignAmbulance: (id, ambulanceId) => post(`/response/cases/${id}/ambulance`, ambulanceId ? { ambulanceId } : {}),
  trip: (id, stage) => post(`/response/cases/${id}/trip`, { stage }),
  arrival: (id) => post(`/response/cases/${id}/arrival`),
  ambulances: () => api('/response/ambulances'),
  addAmbulance: (b) => post('/response/ambulances', b),
  setAmbulance: (id, status) => patch(`/response/ambulances/${id}`, { status }),
  myActive: () => api('/emergency/active?patient=me'),
}
