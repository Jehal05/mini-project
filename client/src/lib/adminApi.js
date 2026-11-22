// Admin endpoints. x-admin-token is the TEMPORARY dev login stub (server/src/middleware/requireAdmin.js).
// Jehal's real admin auth replaces it with a token from the login flow.
export async function adminFetch(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'x-admin-token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
