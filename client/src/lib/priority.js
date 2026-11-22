// Mirror of server/src/services/priority.js (feature 95). Used to re-sort the queue as wait time grows
// without asking the server. Both are tested against shared/priority-fixtures.json, so they cannot drift apart.
const TIER = { critical: 4, high: 3, moderate: 2, low: 1 };
export const DEFAULT_CONFIG = { weights: { risk: 0.5, wait: 0.3, distance: 0.2 }, waitCapMin: 30, distanceCapKm: 20 };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round2 = (n) => Math.round(n * 100) / 100;

function haversineKm(a, b) {
  const R = 6371.0088;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pointOf(c) {
  const loc = c?.location;
  if (Array.isArray(loc?.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates;
    if (num(lat) !== null && num(lng) !== null) return { lat, lng };
  }
  if (num(loc?.lat) !== null && num(loc?.lng) !== null) return { lat: loc.lat, lng: loc.lng };
  return null;
}

export function scoreCase(c, { origin = null, now = Date.now(), config = DEFAULT_CONFIG } = {}) {
  const risk = clamp(num(c.riskScore) ?? 0, 0, 100);
  const detected = c.detectedAt ? new Date(c.detectedAt).getTime() : NaN;
  const waitMin = Number.isFinite(detected) ? Math.max(0, (now - detected) / 60000) : 0;
  const wait = (Math.min(waitMin, config.waitCapMin) / config.waitCapMin) * 100;
  const point = pointOf(c);
  const distanceKm = origin && point ? haversineKm(origin, point) : null;
  const distance = distanceKm === null ? 0 : (1 - Math.min(distanceKm, config.distanceCapKm) / config.distanceCapKm) * 100;
  const w = config.weights;
  return {
    tier: TIER[c.severity] ?? 0,
    priorityScore: round2(risk * w.risk + wait * w.wait + distance * w.distance),
    factors: { risk: round2(risk), wait: round2(wait), distance: round2(distance) },
    waitMinutes: round2(waitMin),
    distanceKm: distanceKm === null ? null : round2(distanceKm),
  };
}

const idOf = (c) => String(c._id ?? c.id ?? '');
const detectedMs = (c) => (c.detectedAt ? new Date(c.detectedAt).getTime() : 0) || 0;

export function prioritizeCases(cases, ctx = {}) {
  return cases
    .map((c) => ({ case: c, priority: scoreCase(c, ctx) }))
    .sort(
      (a, b) =>
        b.priority.tier - a.priority.tier ||
        b.priority.priorityScore - a.priority.priorityScore ||
        detectedMs(a.case) - detectedMs(b.case) ||
        idOf(a.case).localeCompare(idOf(b.case)),
    );
}

export const sortNewest = (cases) => [...cases].sort((a, b) => detectedMs(b) - detectedMs(a) || idOf(a).localeCompare(idOf(b)));

// Short text for the "why this order" tooltip.
export function explain(p) {
  if (!p) return '';
  const parts = [`risk ${p.factors.risk}`, `waiting ${Math.round(p.waitMinutes)} min`, p.distanceKm == null ? 'distance unknown' : `${p.distanceKm} km away`];
  return `Severity first, then score ${p.priorityScore} (${parts.join(', ')})`;
}
