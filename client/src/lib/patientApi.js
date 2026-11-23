// The signed-in patient's own record. The server takes the record from the token, so no patient id is ever sent.
import { authedFetch } from './session.js';

async function call(method, path, body) {
  let res;
  try { res = await authedFetch(`/api/patients/me${path}`, { method, body }); } catch { throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { fields: {} }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code, fields: data.fields ?? {} });
  return data;
}

export const fetchMe = () => call('GET', '').then((d) => d.patient);
export const savePersonal = (body) => call('PATCH', '/personal', body).then((d) => d.patient);
export const savePreferences = (body) => call('PUT', '/preferences', body).then((d) => d.patient);
export const addSectionItem = (section, body) => call('POST', `/${section}`, body).then((d) => d.patient);
export const updateSectionItem = (section, id, body) => call('PATCH', `/${section}/${id}`, body).then((d) => d.patient);
export const deleteSectionItem = (section, id) => call('DELETE', `/${section}/${id}`).then((d) => d.patient);
export const addContact = (body) => call('POST', '/contacts', body).then((d) => d.patient);
export const updateContact = (id, body) => call('PATCH', `/contacts/${id}`, body).then((d) => d.patient);
export const deleteContact = (id) => call('DELETE', `/contacts/${id}`).then((d) => d.patient);
export const reorderContacts = (order) => call('PUT', '/contacts/order', { order }).then((d) => d.patient);
export const sendTestAlert = (id) => call('POST', `/contacts/${id}/test-alert`);
export const listDocuments = () => call('GET', '/documents').then((d) => d.documents);
export const uploadDocument = (body) => call('POST', '/documents', body).then((d) => d.document);
export const deleteDocument = (id) => call('DELETE', `/documents/${id}`);
export const savePhoto = (body) => call('PUT', '/photo', body).then((d) => d.patient);
export const deletePhoto = () => call('DELETE', '/photo').then((d) => d.patient);
export const fetchQr = () => call('GET', '/qr');
export const regenerateQr = () => call('POST', '/qr/regenerate');

/** Files need the Bearer token, so they are fetched and shown from a temporary blob URL (caller revokes it). */
export async function fetchFileUrl(path) {
  const res = await authedFetch(`/api/patients/me${path}`);
  if (!res.ok) throw new Error('Could not open the file');
  return URL.createObjectURL(await res.blob());
}
export const documentUrl = (id) => fetchFileUrl(`/documents/${id}/file`);
export const photoUrl = () => fetchFileUrl('/photo');

export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('The file could not be read'));
    r.readAsDataURL(file);
  });
}
