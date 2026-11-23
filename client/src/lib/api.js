async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null),
  ).toString();
  const res = await fetch(`/api/hospitals${path}${qs ? `?${qs}` : ''}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const fetchRanked = (params) => get('/rank', params);
export const fetchCapability = (id) => get(`/${id}/capability`);
export const searchHospitals = (params) => get('', params);

// Address search via OpenStreetMap Nominatim (free, for light use). Returns { lat, lng, label } or null.
export async function geocodeAddress(text) {
  if (!text || !text.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Address search failed');
  const rows = await res.json();
  if (!rows.length) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lon), label: rows[0].display_name };
}
