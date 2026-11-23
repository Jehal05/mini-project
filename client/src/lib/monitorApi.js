// Monitoring simulator controls and history (signed-in users). Scenario switching is for administrators only; the server enforces it.
import { authedFetch } from './session.js';

async function call(method, path, body) {
  let res;
  try { res = await authedFetch(`/api/sim${path}`, { method, body }); } catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
export const fetchScenarios = () => call('GET', '/scenarios');
export const fetchMonitored = () => call('GET', '/patients');
export const setScenario = (patientId, scenario) => call('POST', `/patients/${patientId}/scenario`, { scenario });
