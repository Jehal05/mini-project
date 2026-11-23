// The server sends the latest vitals only, so the Doctor screen keeps a short history of what it has seen.
export function appendReading(history, vitals, max = 20) {
  if (!vitals) return history;
  const at = vitals.recordedAt ?? null;
  if (at && history.some((h) => h.recordedAt === at)) return history; // same reading again
  return [...history, vitals].slice(-max);
}
export const seriesOf = (history, key) => history.map((h) => h[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
