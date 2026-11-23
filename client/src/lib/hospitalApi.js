// The hospital's own management screens. The server takes the hospital from the signed-in account.
import { authedFetch } from './session.js';

async function call(method, path, body) {
  let res;
  try { res = await authedFetch(`/api/hospital${path}`, { method, body }); } catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { fields: {} }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code, fields: data.fields ?? {} });
  return data;
}

export const fetchProfile = () => call('GET', '/me').then((d) => d.hospital);
export const saveProfile = (body) => call('PATCH', '/me', body).then((d) => d.hospital);
export const fetchDashboard = () => call('GET', '/dashboard');
export const fetchStaff = () => call('GET', '/doctors').then((d) => d.doctors);
export const createDoctor = (body) => call('POST', '/doctors', body).then((d) => d.doctor);
export const updateDoctor = (id, body) => call('PATCH', `/doctors/${id}`, body).then((d) => d.doctor);
export const fetchEd = () => call('GET', '/ed');
export const createBay = (label) => call('POST', '/ed/bays', { label });
export const bayAction = (id, body) => call('PATCH', `/ed/bays/${id}`, body);
export const deleteBay = (id) => call('DELETE', `/ed/bays/${id}`);
export const fetchHistory = ({ status = 'all', page = 1 } = {}) => call('GET', `/history?status=${status}&page=${page}&limit=20`);
