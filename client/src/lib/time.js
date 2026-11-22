// "m:ss" for a countdown. Negative means overdue.
export function formatCountdown(ms) {
  const overdue = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${overdue ? '-' : ''}${m}:${s}`;
}

export function formatMinutes(min) {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
