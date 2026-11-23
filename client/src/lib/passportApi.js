// The QR passport. Reading and reporting need no sign-in (a stranger scanned the code); the full record needs a hospital login.
import { authedFetch } from './session.js';

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code, fields: data.fields ?? {} });
  return data;
}

export const fetchPassport = (token) => fetch(`/api/passport/${token}`).then(json).then((d) => d.passport);
export const reportEmergency = (token, loc) => fetch(`/api/passport/${token}/report`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude, ...(loc.accuracy != null && { accuracyMeters: loc.accuracy }) }),
}).then(json);
export const fetchFullRecord = (token) => authedFetch(`/api/passport/${token}/full`).then(json).then((d) => d.patient);

export async function openFullDocument(token, docId) {
  const res = await authedFetch(`/api/passport/${token}/full/documents/${docId}/file`);
  if (!res.ok) throw new Error('Could not open the document');
  return URL.createObjectURL(await res.blob());
}
