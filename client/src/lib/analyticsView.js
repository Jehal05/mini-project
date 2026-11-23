// Turns the analytics summary into chart rows. Masked values stay null so charts leave a gap and the table says "fewer than 3".
export const MASK_TEXT = 'fewer than 3';

export const SEVERITY_LABELS = { critical: 'Critical', high: 'High', moderate: 'Moderate', low: 'Low' };

export function timingRows(responseTimes) {
  const names = { toAccept: 'To hospital accept', toDispatch: 'To ambulance dispatch', toPickup: 'To patient pickup', toArrival: 'To hospital arrival' };
  return Object.entries(names).map(([key, name]) => {
    const t = responseTimes?.[key] || {};
    return { key, name, median: t.median ?? null, p90: t.p90 ?? null, n: t.n ?? null, masked: Boolean(t.masked) };
  });
}

export const reasonLabel = (r) => (r === 'no_answer' ? 'No answer' : r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));

export const reasonRows = (reasons = []) => reasons.map((r) => ({ name: reasonLabel(r.reason), count: r.count, masked: r.masked }));

export const hospitalRows = (hospitals = []) =>
  hospitals.map((h) => ({ name: h.name, acceptanceRate: h.acceptanceRate, avgResponseMin: h.avgResponseMin, notified: h.notified, masked: h.masked }));

export const ambulanceRows = (ambulances = []) =>
  ambulances.map((a) => ({ name: `${a.vehicleNumber} (${a.type})`, trips: a.trips, onTripPercent: a.onTripPercent, masked: a.masked }));

// Text for a table cell: a number, a dash for "no data", or the masking label.
export function cell(value, masked, suffix = '') {
  if (masked) return MASK_TEXT;
  if (value === null || value === undefined) return '–';
  return `${value}${suffix}`;
}

export const hasData = (summary) => Boolean(summary && summary.totals?.cases > 0);

// Date input value (YYYY-MM-DD) for "n days ago".
export const dateInput = (daysAgo, now = new Date()) => new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
