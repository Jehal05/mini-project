// Route with geometry for the ambulance legs (feature 76). Providers: osrm, mapbox, google.
// If routing fails or has no key, we use a straight-line path labelled etaSource "estimate".
import { env } from '../config/env.js';
import { haversineKm, round } from './geo.js';
import { fetchJson } from './routing.js';

const STEP_M = 200; // straight-line fallback gets a point about every 200 m so the marker moves smoothly

export function straightLineRoute(from, to) {
  const distM = haversineKm(from, to) * 1000;
  const n = Math.min(300, Math.max(1, Math.ceil(distM / STEP_M)));
  const coordinates = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    coordinates.push([from.lng + (to.lng - from.lng) * t, from.lat + (to.lat - from.lat) * t]);
  }
  return { coordinates, distanceKm: round(distM / 1000), providerDurationMin: null, etaSource: 'estimate' };
}

// Google returns an encoded polyline. This is the standard decoder (precision 5).
export function decodePolyline(str) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const axis of ['lat', 'lng']) {
      let result = 0, shift = 0, byte;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta; else lng += delta;
    }
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

const providers = {
  async osrm(from, to, { fetchImpl, timeoutMs }) {
    const url = `${env.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const data = await fetchJson(url, fetchImpl, timeoutMs);
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r?.geometry?.coordinates?.length) throw new Error('OSRM returned no route');
    return { coordinates: r.geometry.coordinates, distanceM: r.distance, durationS: r.duration };
  },
  async mapbox(from, to, { fetchImpl, timeoutMs, apiKey }) {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson&access_token=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url, fetchImpl, timeoutMs);
    const r = data.routes?.[0];
    if (!r?.geometry?.coordinates?.length) throw new Error('Mapbox returned no route');
    return { coordinates: r.geometry.coordinates, distanceM: r.distance, durationS: r.duration };
  },
  async google(from, to, { fetchImpl, timeoutMs, apiKey }) {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}` +
      `&destination=${to.lat},${to.lng}&mode=driving&key=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url, fetchImpl, timeoutMs);
    const route = data.routes?.[0];
    const leg = route?.legs?.[0];
    if (data.status !== 'OK' || !leg) throw new Error(`Google Directions status ${data.status}`);
    return { coordinates: decodePolyline(route.overview_polyline.points), distanceM: leg.distance.value, durationS: leg.duration.value };
  },
};

export async function getRouteGeometry(from, to, options = {}) {
  const { provider = env.routingProvider, apiKey = env.mapsApiKey, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = options;
  const needsKey = provider === 'mapbox' || provider === 'google';
  const impl = providers[provider];
  if (!impl || (needsKey && !apiKey) || typeof fetchImpl !== 'function') return straightLineRoute(from, to);

  try {
    const r = await impl(from, to, { fetchImpl, timeoutMs, apiKey });
    return {
      coordinates: r.coordinates,
      distanceKm: round(r.distanceM / 1000),
      providerDurationMin: round(r.durationS / 60, 1),
      etaSource: provider,
    };
  } catch {
    return straightLineRoute(from, to);
  }
}
