// Beds, admissions, notes, prescriptions and discharge for the signed-in hospital user. The server takes the hospital from the token.
import { authedFetch } from './session.js';

async function call(method, path, body) {
  let res;
  try { res = await authedFetch(`/api/inpatient${path}`, { method, body }); } catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { fields: {} }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code, fields: data.fields ?? {}, allergens: data.allergens });
  return data;
}

export const fetchBeds = () => call('GET', '/beds');
export const addBed = (body) => call('POST', '/beds', body).then((d) => d.bed);
export const setBedStatus = (id, status) => call('PATCH', `/beds/${id}`, { status }).then((d) => d.bed);
export const removeBed = (id) => call('DELETE', `/beds/${id}`);
export const fetchDoctors = () => call('GET', '/doctors').then((d) => d.doctors);
export const fetchAdmissions = (status = 'admitted') => call('GET', `/admissions?status=${status}`).then((d) => d.admissions);
export const admitPatient = (body) => call('POST', '/admissions', body).then((d) => d.admission);
export const fetchAdmission = (id) => call('GET', `/admissions/${id}`).then((d) => d.admission);
export const fetchRecords = (id) => call('GET', `/admissions/${id}/records`).then((d) => d.records);
export const addRecord = (id, body) => call('POST', `/admissions/${id}/records`, body).then((d) => d.record);
export const fetchPrescriptions = (id) => call('GET', `/admissions/${id}/prescriptions`).then((d) => d.prescriptions);
export const checkAllergy = (id, drug) => call('GET', `/admissions/${id}/prescriptions/check?drug=${encodeURIComponent(drug)}`).then((d) => d.allergens);
export const prescribe = (id, body) => call('POST', `/admissions/${id}/prescriptions`, body).then((d) => d.prescription);
export const fetchDischarge = (id) => call('GET', `/admissions/${id}/discharge`);
export const finalizeDischarge = (id, body) => call('POST', `/admissions/${id}/discharge`, body);

// ECG and lab reports for a stay: sent as base64 JSON, opened through a temporary blob URL (the caller revokes it).
export const addRecordFile = (id, body) => call('POST', `/admissions/${id}/records/file`, body).then((d) => d.record);
export async function recordFileUrl(id, recordId) {
  let res;
  try { res = await authedFetch(`/api/inpatient/admissions/${id}/records/${recordId}/file`); } catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  if (!res.ok) throw new Error('Could not open the file');
  return URL.createObjectURL(await res.blob());
}
