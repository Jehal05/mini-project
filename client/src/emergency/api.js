// REST client for the SOS module (server/src/emergency/routes.js). Signed-in calls carry the Bearer token.
import { authedFetch } from '../lib/session.js';

async function call(method, path, body) {
  let res;
  try { res = await authedFetch(`/api/emergency${path}`, { method, body }); } catch { throw new Error('Cannot reach the server. Call 112 or 108 if you need help now.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
const q = (v) => encodeURIComponent(v);

export const emergencyApi = {
  sos: (patient, location) => call('POST', '/sos', { patient, ...(location && { location }) }),
  get: (caseId) => call('GET', `/${caseId}`),
  active: (patient) => call('GET', `/active?patient=${q(patient)}`),
  mine: (patient, { page = 1, limit = 5 } = {}) => call('GET', `/mine?patient=${q(patient)}&page=${page}&limit=${limit}`),
  firstAid: (patient) => call('GET', `/first-aid?patient=${q(patient)}`),
  saveSymptoms: (caseId, symptoms) => call('PUT', `/${caseId}/symptoms`, { symptoms }),
  confirm: (caseId, symptoms) => call('POST', `/${caseId}/confirm`, { symptoms }),
  cancel: (caseId, reason, note) => call('POST', `/${caseId}/cancel`, { reason, ...(note && { note }) }),
  location: (caseId, location) => call('PUT', `/${caseId}/location`, location),
  ack: (caseId, who) => call('POST', `/${caseId}/ack`, who),
  // Family link: the token in the link is the credential, no sign-in
  publicStatus: (token) => call('GET', `/status/${q(token)}`),
  seen: (token) => call('POST', `/status/${q(token)}/seen`, {}),
};
