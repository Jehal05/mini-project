// Admin endpoints with the signed-in person's token. x-admin-token is only the demo-mode fallback.
import { authedFetch } from './session.js';

export async function adminFetch(token, path, { method = 'GET', body } = {}) {
  const res = await authedFetch(`/api${path}`, { method, body, legacy: { 'x-admin-token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
