// Accessible horizontal bar for a score (role="meter" with aria values), used for totals and breakdown rows.
export default function ScoreBar({ value, max, label, size = 'md' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={`${value} of ${max}`}
      className={`w-full overflow-hidden rounded-full bg-white/10 ${height}`}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}
