// Feature 95: the ONE place that orders emergency cases. Pure, no database, no clock of its own.
// Severity is a hard tier. Inside a tier a weighted score decides: risk, wait time, distance.
// client/src/lib/priority.js mirrors this file; both are tested against shared/priority-fixtures.json.
import { env } from '../config/env.js';
import { haversineKm } from './geo.js';

const SEVERITY_TIER = { critical: 4, high: 3, moderate: 2, low: 1 };
export const severityRank = (s) => SEVERITY_TIER[s] ?? 0;

export const DEFAULT_CONFIG = Object.freeze({
  weights: Object.freeze({ risk: 0.5, wait: 0.3, distance: 0.2 }),
  waitCapMin: 30, // waiting longer than this adds nothing more, so very old cases do not dominate
  distanceCapKm: 20, // farther than this scores 0 for distance
});

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round2 = (n) => Math.round(n * 100) / 100;

// Accepts a raw case ({ location: { coordinates: [lng, lat] } }) or a serialized one ({ location: { lat, lng } }).
export function pointOf(c) {
  const loc = c?.location;
  if (Array.isArray(loc?.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates;
    if (num(lat) !== null && num(lng) !== null) return { lat, lng };
  }
  if (num(loc?.lat) !== null && num(loc?.lng) !== null) return { lat: loc.lat, lng: loc.lng };
  return null;
}

// Weights from env, e.g. PRIORITY_WEIGHTS="0.6,0.3,0.1" (risk, wait, distance). Bad values fall back to the defaults.
export function configFromEnv(raw = env.priorityWeights, caps = {}) {
  const parts = String(raw || '').split(',').map((x) => Number(x.trim()));
  const ok = parts.length === 3 && parts.every((x) => Number.isFinite(x) && x >= 0) && parts.some((x) => x > 0);
  const sum = ok ? parts.reduce((a, b) => a + b, 0) : 1;
  const weights = ok ? { risk: parts[0] / sum, wait: parts[1] / sum, distance: parts[2] / sum } : { ...DEFAULT_CONFIG.weights };
  return {
    weights,
    waitCapMin: caps.waitCapMin > 0 ? caps.waitCapMin : DEFAULT_CONFIG.waitCapMin,
    distanceCapKm: caps.distanceCapKm > 0 ? caps.distanceCapKm : DEFAULT_CONFIG.distanceCapKm,
  };
}

// Each factor is 0 to 100. Missing data scores 0 instead of throwing or sorting randomly.
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
    tier: severityRank(c.severity),
    priorityScore: round2(risk * w.risk + wait * w.wait + distance * w.distance),
    factors: { risk: round2(risk), wait: round2(wait), distance: round2(distance) },
    waitMinutes: round2(waitMin),
    distanceKm: distanceKm === null ? null : round2(distanceKm),
  };
}

const idOf = (c) => String(c._id ?? c.id ?? '');
const detectedMs = (c) => (c.detectedAt ? new Date(c.detectedAt).getTime() : 0) || 0;

// Tier, then score, then who was detected first, then id. Same input always gives the same order.
export function compareScored(a, b) {
  return (
    b.priority.tier - a.priority.tier ||
    b.priority.priorityScore - a.priority.priorityScore ||
    detectedMs(a.case) - detectedMs(b.case) ||
    idOf(a.case).localeCompare(idOf(b.case))
  );
}

// Returns [{ case, priority }] most urgent first.
export function prioritizeCases(cases, ctx = {}) {
  return cases.map((c) => ({ case: c, priority: scoreCase(c, ctx) })).sort(compareScored);
}

// ?sort=newest
export function sortNewest(cases) {
  return [...cases].sort((a, b) => detectedMs(b) - detectedMs(a) || idOf(a).localeCompare(idOf(b)));
}

export const SORT_MODES = ['priority', 'newest'];
