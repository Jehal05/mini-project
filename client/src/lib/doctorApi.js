// Calls the doctor endpoints with the signed-in person's token. x-doctor-id is only the demo-mode fallback.
import { authedFetch } from './session.js';

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const fetchDoctorLogins = async () => (await parse(await fetch('/api/doctors/dev-options'))).results || [];
export const fetchDoctorCases = async (doctorId) => parse(await authedFetch(`/api/doctors/${doctorId}/cases`, { legacy: { 'x-doctor-id': doctorId } }));
