// Geometry and words for the semicircle gauge. Pure, so the maths can be tested without a browser.
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** 0 (left end) to 1 (right end) for a value on the scale. Not a number gives null. */
export function fractionOf(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || max <= min) return null;
  return clamp((value - min) / (max - min), 0, 1);
}

/** Point on the upper half circle. fraction 0 = left, 0.5 = top, 1 = right. */
export function arcPoint(cx, cy, r, fraction) {
  const a = Math.PI * (1 - fraction);
  return { x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy - r * Math.sin(a)).toFixed(2) };
}

/** SVG path for the arc between two fractions. */
export function arcPath(cx, cy, r, from, to) {
  const a = arcPoint(cx, cy, r, from); const b = arcPoint(cx, cy, r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

/** 'low' | 'in' | 'high' | 'unknown' against the normal range. */
export function rangeState(value, low, high) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
  if (value < low) return 'low';
  if (value > high) return 'high';
  return 'in';
}

const WORDS = { low: 'below the range', in: 'within the range', high: 'above the range', unknown: 'no reading' };
/** Spoken text, so the gauge is never only a picture. */
export function gaugeLabel({ label, value, unit, low, high }) {
  const s = rangeState(value, low, high);
  if (s === 'unknown') return `${label}: no reading`;
  return `${label} ${value} ${unit}, ${WORDS[s]} of ${low} to ${high}`;
}
