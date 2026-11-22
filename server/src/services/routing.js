import { env } from '../config/env.js';
import { haversineKm, round } from './geo.js';

// Road distance and drive time (feature 54). Providers: osrm (free), mapbox, google.
// If the provider fails or has no key, we return a straight-line estimate labelled etaSource "estimate".
const ROAD_FACTOR = 1.3; // straight line -> typical road distance
const URBAN_SPEED_KMH = 35;

export function estimateRoute(from, to) {
  const distanceKm = haversineKm(from, to) * ROAD_FACTOR;
  return {
    distanceKm: round(distanceKm),
    durationMin: round((distanceKm / URBAN_SPEED_KMH) * 60, 1),
    etaSource: 'estimate',
  };
}

export async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const providers = {
  async osrm(from, to, { fetchImpl, timeoutMs }) {
    const url = `${env.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const data = await fetchJson(url, fetchImpl, timeoutMs);
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r) throw new Error('OSRM returned no route');
    return { distanceM: r.distance, durationS: r.duration };
  },
  async mapbox(from, to, { fetchImpl, timeoutMs, apiKey }) {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=false&access_token=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url, fetchImpl, timeoutMs);
    const r = data.routes?.[0];
    if (!r) throw new Error('Mapbox returned no route');
    return { distanceM: r.distance, durationS: r.duration };
  },
  async google(from, to, { fetchImpl, timeoutMs, apiKey }) {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}` +
      `&destination=${to.lat},${to.lng}&mode=driving&key=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url, fetchImpl, timeoutMs);
    const leg = data.routes?.[0]?.legs?.[0];
    if (data.status !== 'OK' || !leg) throw new Error(`Google Directions status ${data.status}`);
    return { distanceM: leg.distance.value, durationS: leg.duration.value };
  },
};

export async function getRoadRoute(from, to, options = {}) {
  const {
    provider = env.routingProvider,
    apiKey = env.mapsApiKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = 4000,
  } = options;

  const needsKey = provider === 'mapbox' || provider === 'google';
  const impl = providers[provider];
  if (!impl || (needsKey && !apiKey) || typeof fetchImpl !== 'function') {
    return estimateRoute(from, to);
  }

  try {
    const { distanceM, durationS } = await impl(from, to, { fetchImpl, timeoutMs, apiKey });
    return {
      distanceKm: round(distanceM / 1000),
      durationMin: round(durationS / 60, 1),
      etaSource: provider,
    };
  } catch {
    return estimateRoute(from, to);
  }
}
