// Pure route maths for the ambulance simulator (features 75, 77). Coordinates are GeoJSON [lng, lat].
import { haversineKm } from './geo.js';

const pt = ([lng, lat]) => ({ lat, lng });

export function segmentLengthsM(coords) {
  const out = [];
  for (let i = 1; i < coords.length; i += 1) out.push(haversineKm(pt(coords[i - 1]), pt(coords[i])) * 1000);
  return out;
}

export const pathLengthM = (coords) => segmentLengthsM(coords).reduce((a, b) => a + b, 0);

// The point `meters` along the path, interpolated inside the segment it falls in. Clamped to the ends.
export function positionAlong(coords, meters, lengths = segmentLengthsM(coords)) {
  if (!coords.length) return null;
  if (coords.length === 1 || meters <= 0) return pt(coords[0]);

  let left = meters;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i];
    if (left <= len || i === lengths.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, left / len);
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];
      return { lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t };
    }
    left -= len;
  }
  return pt(coords[coords.length - 1]);
}

export const kmhToMps = (kmh) => (kmh * 1000) / 3600;
export const remainingM = (totalM, alongM) => Math.max(0, totalM - alongM);

// Seconds to cover `meters` at `speedKmh`.
export const etaSeconds = (meters, speedKmh) => (speedKmh > 0 ? meters / kmhToMps(speedKmh) : Infinity);
export const etaMinutes = (meters, speedKmh) => Math.round((etaSeconds(meters, speedKmh) / 60) * 10) / 10;

// Moves along a leg for dtSec seconds. Never goes past the end.
export function advanceAlong({ alongM, totalM, speedKmh, dtSec }) {
  const next = Math.min(totalM, alongM + kmhToMps(speedKmh) * Math.max(0, dtSec));
  return { alongM: next, done: next >= totalM };
}
