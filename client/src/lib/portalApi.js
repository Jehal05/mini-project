// Calls the hospital-staff endpoints. The x-hospital-id header is the TEMPORARY dev login stub
// (server/src/middleware/requireHospitalStaff.js). Jehal's real auth replaces it with a token.
export async function portalFetch(hospitalId, path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'x-hospital-id': hospitalId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
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
