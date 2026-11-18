// API calls for hospitals: nearby (features 53-54) and search (feature 56), plus a readable error helper.
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: 8000,
});

export async function getNearby({ lat, lng, radiusKm = 10, cardiacOnly = false, signal }) {
  const params = { lat, lng, radiusKm };
  if (cardiacOnly) params.cardiacOnly = true;
  const { data } = await api.get('/api/hospitals/near', { params, signal });
  return data.hospitals;
}

export async function searchHospitals({ q, lat, lng, signal }) {
  const params = { q };
  if (lat !== undefined && lng !== undefined) {
    params.lat = lat;
    params.lng = lng;
  }
  const { data } = await api.get('/api/hospitals/search', { params, signal });
  return data.hospitals;
}

// Features 57-60: suitable hospitals ranked with score breakdowns. exclude = ids that rejected.
export async function rankHospitals({ lat, lng, radiusKm = 10, exclude = [], signal }) {
  const params = { lat, lng, radiusKm };
  if (exclude.length) params.exclude = exclude.join(',');
  const { data } = await api.get('/api/hospitals/rank', { params, signal });
  return data;
}

export async function getHospital(id) {
  const { data } = await api.get(`/api/hospitals/${id}`);
  return data.hospital;
}

// Feature 58 demo controls: change capacity (beds, cath lab, cardiologist, ALS).
export async function updateCapabilities(id, changes) {
  const { data } = await api.patch(`/api/hospitals/${id}/capabilities`, changes);
  return data.hospital;
}

// Returns null for cancelled requests (they are not errors), otherwise a message for the UI.
export function errorMessage(err) {
  if (axios.isCancel(err)) return null;
  if (!err.response) {
    return 'Cannot reach the HealthTwin server. Check that it is running on port 5000.';
  }
  return err.response.data?.message || `Request failed (${err.response.status})`;
}
