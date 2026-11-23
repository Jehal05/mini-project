// Calls the doctor endpoints. The x-doctor-id header is the TEMPORARY dev login stub
// (server/src/middleware/requireDoctor.js). Jehal's real auth replaces it with a token.
async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const fetchDoctorLogins = async () => (await parse(await fetch('/api/doctors/dev-options'))).results || [];
export const fetchDoctorCases = async (doctorId) => parse(await fetch(`/api/doctors/${doctorId}/cases`, { headers: { 'x-doctor-id': doctorId } }));
