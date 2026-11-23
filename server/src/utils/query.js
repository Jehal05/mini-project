import { httpError } from './httpError.js';

export const DEFAULT_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 50;

export function parseCoords(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (query.lat === undefined || query.lng === undefined || query.lat === '' || query.lng === '') {
    throw httpError(400, 'lat and lng are required');
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw httpError(400, 'lat must be a number between -90 and 90');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw httpError(400, 'lng must be a number between -180 and 180');
  return { lat, lng };
}

export function parseRadiusKm(value) {
  if (value === undefined || value === '') return DEFAULT_RADIUS_KM;
  const r = Number(value);
  if (!Number.isFinite(r) || r <= 0) throw httpError(400, 'radiusKm must be a positive number');
  return Math.min(r, MAX_RADIUS_KM); // cap
}

export function parseBool(value, fallback = undefined) {
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw httpError(400, `Expected true or false, got "${value}"`);
}

export function parseFilters(query) {
  const emergency = parseBool(query.emergency, false);
  const minCcuBeds = query.minCcuBeds === undefined || query.minCcuBeds === '' ? undefined : Number(query.minCcuBeds);
  if (minCcuBeds !== undefined && (!Number.isInteger(minCcuBeds) || minCcuBeds < 0)) {
    throw httpError(400, 'minCcuBeds must be a non-negative integer');
  }
  return {
    q: typeof query.q === 'string' && query.q.trim() ? query.q.trim().slice(0, 80) : undefined,
    area: typeof query.area === 'string' && query.area.trim() ? query.area.trim().slice(0, 80) : undefined,
    cathLab: parseBool(query.cathLab),
    cardiologist: parseBool(query.cardiologist),
    minCcuBeds,
    // Cardiac-care filter is on by default in an emergency, and an explicit value always wins.
    cardiacOnly: parseBool(query.cardiacOnly, emergency),
  };
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
