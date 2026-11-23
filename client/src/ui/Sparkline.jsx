// Tiny trend line for vitals. Needs two or more points. The latest point is marked.
export default function Sparkline({ values = [], width = 120, height = 32, tone = 'text-accent', label }) {
  if (values.length < 2) return <span className="text-xs text-muted">Not enough readings yet</span>;
  const min = Math.min(...values); const max = Math.max(...values);
  const span = max - min || 1; const pad = 3;
  const pts = values.map((v, i) => [pad + (i * (width - 2 * pad)) / (values.length - 1), height - pad - ((v - min) / span) * (height - 2 * pad)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" className={tone}
      aria-label={label ?? `Trend over the last ${values.length} readings, latest ${values[values.length - 1]}`}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  );
}
