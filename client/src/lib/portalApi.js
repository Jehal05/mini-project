// Calls the hospital-staff endpoints with the signed-in person's token. The x-hospital-id header is only the
// demo-mode fallback (server accepts it in tests or with DEV_AUTH=true).
import { authedFetch } from './session.js';

export async function portalFetch(hospitalId, path, { method = 'GET', body } = {}) {
  const res = await authedFetch(`/api${path}`, { method, body, legacy: { 'x-hospital-id': hospitalId } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const fetchHospitals = async () => {
  const res = await fetch('/api/hospitals');
  const data = await res.json();
  return data.results || [];
};

export async function createDemoEmergency(lat, lng) {
  const res = await fetch('/api/demo/emergency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, severity: 'critical' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not create the demo emergency');
  return data;
}
