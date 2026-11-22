// Crew endpoints. x-ambulance-id is the TEMPORARY dev login stub (server/src/middleware/requireAmbulanceCrew.js).
// Jehal's real auth replaces it with a token.
export async function crewFetch(ambulanceId, path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'x-ambulance-id': ambulanceId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
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
