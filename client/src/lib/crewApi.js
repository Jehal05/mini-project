// Crew endpoints with the signed-in person's token. x-ambulance-id is only the demo-mode fallback.
import { authedFetch } from './session.js';

export async function crewFetch(ambulanceId, path, { method = 'GET', body } = {}) {
  const res = await authedFetch(`/api${path}`, { method, body, legacy: { 'x-ambulance-id': ambulanceId } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchCrewOptions() {
  const res = await fetch('/api/ambulances/crew-options');
  const data = await res.json().catch(() => ({}));
  return data.results || [];
}

export async function fetchPublicTrip(caseId) {
  const res = await fetch(`/api/trips/${caseId}/public`);
  if (!res.ok) return null;
  return (await res.json()).trip;
}
