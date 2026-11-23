import { arcPath, arcPoint, fractionOf, gaugeLabel, rangeState } from '../lib/gauge.js';

const STATE_WORD = { low: 'Below range', in: 'In range', high: 'Above range', unknown: 'No reading' };
const STATE_TONE = { low: 'text-moderate', in: 'text-low', high: 'text-critical', unknown: 'text-muted' };

// Semicircle gauge with the value in the middle, a marker on the arc and the normal range lit. The state is a word,
// not just a colour, and the whole thing has a spoken label. The marker moves smoothly (no jump) unless motion is reduced.
export default function GaugeArc({ label = 'Heart rate', value, unit = 'bpm', min = 40, max = 160, low = 60, high = 100, size = 260 }) {
  const cx = 130; const cy = 130; const r = 100;
  const f = fractionOf(value, min, max);
  const state = rangeState(value, low, high);
  const lo = fractionOf(low, min, max); const hi = fractionOf(high, min, max);
  const marker = f == null ? null : arcPoint(cx, cy, r, f);
  return (
    <figure className="m-0 text-center" style={{ width: size, maxWidth: '100%' }}>
      <svg viewBox="0 0 260 160" role="img" aria-label={gaugeLabel({ label, value, unit, low, high })} className="w-full">
        <path d={arcPath(cx, cy, r, 0, 1)} fill="none" stroke="rgb(var(--line))" strokeWidth="14" strokeLinecap="round" />
        <path d={arcPath(cx, cy, r, lo, hi)} fill="none" stroke="rgb(var(--critical))" strokeWidth="14" strokeLinecap="round" opacity="0.95" />
        <text x={arcPoint(cx, cy, r + 26, 0).x} y="150" textAnchor="middle" className="fill-current text-muted" fontSize="13">{`<${low}`}</text>
        <text x={arcPoint(cx, cy, r + 26, 1).x} y="150" textAnchor="middle" className="fill-current text-muted" fontSize="13">{`${high}>`}</text>
        {marker && <circle cx={marker.x} cy={marker.y} r="9" fill="rgb(var(--surface))" stroke="rgb(var(--critical))" strokeWidth="5" style={{ transition: 'cx .6s ease, cy .6s ease' }} />}
        <text x={cx} y="112" textAnchor="middle" className="fill-current text-ink tnum" fontSize="52" fontWeight="600">{value ?? '–'}</text>
        <text x={cx} y="136" textAnchor="middle" className="fill-current text-muted" fontSize="15">{unit}</text>
      </svg>
      <figcaption className={`-mt-1 text-sm font-semibold ${STATE_TONE[state]}`}>{STATE_WORD[state]}, {low} to {high} {unit}</figcaption>
    </figure>
  );
}
