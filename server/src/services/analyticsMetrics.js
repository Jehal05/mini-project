// Feature 96: pure analytics maths. Plain arrays in, plain aggregates out. No database, no patient data.
// Callers pass cases that were already stripped to the fields below (see analyticsRepo.js), and the
// output is built from scratch, so a patient name, phone, address or vital can never leak through here.
import { httpError } from '../utils/httpError.js';
import { GOLDEN_HOUR_STAGES } from './goldenHour.js';

export const MIN_GROUP = 3; // groups of 1 or 2 cases are shown as "fewer than 3"
export const MASK_LABEL = 'fewer than 3';
export const GOLDEN_HOUR_MIN = 60; // detection to first medical contact
export const MAX_RANGE_DAYS = 366;
export const SEVERITIES = ['critical', 'high', 'moderate', 'low'];

const DAY_MS = 86400000;
const ms = (v) => (v == null ? null : new Date(v).getTime());
const minutesBetween = (a, b) => (a == null || b == null || Number.isNaN(a) || Number.isNaN(b) ? null : (b - a) / 60000);
const round1 = (n) => Math.round(n * 10) / 10;
const sid = String;

// Linear interpolation between the two nearest values (same as the common "type 7" percentile).
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

// A count that is 1 or 2 is hidden. 0 and 3+ are shown.
export function maskedCount(n) {
  return n > 0 && n < MIN_GROUP ? { count: null, masked: true, label: MASK_LABEL } : { count: n, masked: false };
}

// Median and 90th percentile in minutes, or masked when fewer than 3 cases contribute.
export function timingStats(minutes) {
  const v = minutes.filter((x) => Number.isFinite(x) && x >= 0);
  if (v.length > 0 && v.length < MIN_GROUP) return { n: null, median: null, p90: null, masked: true, label: MASK_LABEL };
  return { n: v.length, median: v.length ? round1(percentile(v, 50)) : null, p90: v.length ? round1(percentile(v, 90)) : null, masked: false };
}

// ---- date range ----
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(value, name, endOfDay) {
  const d = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${name} must be a valid date (YYYY-MM-DD or ISO time)`);
  return DATE_ONLY.test(value) && endOfDay ? new Date(d.getTime() + DAY_MS - 1) : d;
}

export function parseRange({ from, to } = {}, now = Date.now()) {
  const end = to ? parseDate(String(to), 'to', true) : new Date(now);
  const start = from ? parseDate(String(from), 'from', false) : new Date(end.getTime() - 30 * DAY_MS);
  if (start.getTime() >= end.getTime()) throw httpError(400, 'from must be before to');
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) throw httpError(400, `The date range can be at most ${MAX_RANGE_DAYS} days`);
  return { from: start, to: end };
}

export function parseTzOffset(value) {
  if (value === undefined || value === '') return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < -840 || n > 840) throw httpError(400, 'tzOffsetMinutes must be a whole number between -840 and 840');
  return n;
}

// ---- cases per day, by severity ----
const dayKey = (t, tzOffsetMin) => new Date(t + tzOffsetMin * 60000).toISOString().slice(0, 10);

export function groupByDay(cases, { from, to, tzOffsetMin = 0 }) {
  const rows = new Map();
  for (let t = Date.parse(`${dayKey(from.getTime(), tzOffsetMin)}T00:00:00.000Z`); t <= to.getTime() + tzOffsetMin * 60000; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    rows.set(date, { date, critical: 0, high: 0, moderate: 0, low: 0, total: 0 });
  }
  for (const c of cases) {
    const t = ms(c.detectedAt);
    if (t == null) continue;
    const row = rows.get(dayKey(t, tzOffsetMin));
    if (!row) continue;
    row[SEVERITIES.includes(c.severity) ? c.severity : 'low'] += 1;
    row.total += 1;
  }
  return [...rows.values()];
}

// ---- timings ----
function firstEvent(c, name) {
  const e = (c.timeline || []).find((t) => t.event === name);
  return e ? ms(e.at) : null;
}

export function responseTimings(cases, tripByCase) {
  const out = { accept: [], dispatch: [], pickup: [], arrival: [] };
  for (const c of cases) {
    const d = ms(c.detectedAt);
    const trip = tripByCase.get(sid(c._id));
    const push = (key, end) => { const m = minutesBetween(d, end); if (m !== null && m >= 0) out[key].push(m); };
    push('accept', ms(c.acceptedAt));
    push('dispatch', ms(trip?.stageTimes?.en_route) ?? firstEvent(c, 'ambulance_dispatched'));
    push('pickup', ms(c.patientOnBoardAt) ?? ms(trip?.stageTimes?.patient_on_board));
    push('arrival', ms(trip?.stageTimes?.at_hospital) ?? firstEvent(c, 'arrived_at_hospital'));
  }
  return {
    toAccept: timingStats(out.accept),
    toDispatch: timingStats(out.dispatch),
    toPickup: timingStats(out.pickup),
    toArrival: timingStats(out.arrival),
  };
}

// ---- golden hour ----
export function goldenHourCompliance(cases) {
  const contact = cases.map((c) => minutesBetween(ms(c.detectedAt), ms(c.firstMedicalContactAt))).filter((m) => m !== null && m >= 0);
  const within = contact.filter((m) => m <= GOLDEN_HOUR_MIN).length;
  const stages = GOLDEN_HOUR_STAGES.map((s) => {
    const done = cases.map((c) => minutesBetween(ms(s.start(c)), ms(s.end(c)))).filter((m) => m !== null && m >= 0);
    const ok = done.filter((m) => m <= s.targetMin).length;
    return { key: s.key, label: s.label, targetMin: s.targetMin, ...rate(ok, done.length) };
  });
  return { targetMin: GOLDEN_HOUR_MIN, firstContact: rate(within, contact.length), stages };
}

// Share in 0..100, hidden when fewer than 3 cases were measured.
function rate(ok, n) {
  if (n === 0) return { n: 0, percent: null, masked: false };
  if (n < MIN_GROUP) return { n: null, percent: null, masked: true, label: MASK_LABEL };
  return { n, percent: round1((ok / n) * 100), masked: false };
}

// ---- reasons ----
export function rejectionReasons(cases) {
  const counts = new Map();
  for (const c of cases) {
    for (const t of c.timeline || []) {
      if (t.event === 'rejected') counts.set(t.detail || 'other', (counts.get(t.detail || 'other') || 0) + 1);
      else if (t.event === 'no_answer') counts.set('no_answer', (counts.get('no_answer') || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, n]) => ({ reason, ...maskedCount(n) }));
}

// ---- hospitals ----
export function hospitalStats(cases, hospitals) {
  const rows = new Map(hospitals.map((h) => [sid(h._id), { id: sid(h._id), name: h.name, notified: 0, accepted: 0, response: [] }]));
  for (const c of cases) {
    for (const n of c.notifiedHospitals || []) {
      const row = rows.get(sid(n.hospital));
      if (!row) continue;
      row.notified += 1;
      if (c.hospital && sid(c.hospital) === sid(n.hospital) && c.acceptedAt) {
        row.accepted += 1;
        const m = minutesBetween(ms(n.notifiedAt), ms(c.acceptedAt));
        if (m !== null && m >= 0) row.response.push(m);
      }
    }
  }
  return [...rows.values()]
    .filter((r) => r.notified > 0)
    .map((r) => {
      const small = r.notified < MIN_GROUP;
      return {
        id: r.id,
        name: r.name,
        notified: small ? null : r.notified,
        accepted: small ? null : r.accepted,
        acceptanceRate: small ? null : round1((r.accepted / r.notified) * 100),
        avgResponseMin: small || r.response.length < 1 ? null : round1(r.response.reduce((a, b) => a + b, 0) / r.response.length),
        masked: small,
        ...(small ? { label: MASK_LABEL } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- ambulances ----
// "Not on a trip" is everything else: maintenance history is not recorded, so we do not claim a true availability figure.
export function ambulanceUtilisation(trips, ambulances, { from, to }) {
  const rangeMin = (to.getTime() - from.getTime()) / 60000;
  const byAmb = new Map(ambulances.map((a) => [sid(a._id), { id: sid(a._id), vehicleNumber: a.vehicleNumber, type: a.type, trips: 0, onTripMin: 0 }]));
  for (const t of trips) {
    const row = byAmb.get(sid(t.ambulance));
    const start = ms(t.stageTimes?.en_route);
    if (!row || start == null) continue;
    const end = ms(t.endedAt) ?? ms(t.stageTimes?.at_hospital) ?? to.getTime();
    row.trips += 1;
    row.onTripMin += Math.max(0, (Math.min(end, to.getTime()) - Math.max(start, from.getTime())) / 60000);
  }
  return [...byAmb.values()]
    .map((r) => {
      const small = r.trips > 0 && r.trips < MIN_GROUP;
      const onTripPercent = rangeMin > 0 ? round1((r.onTripMin / rangeMin) * 100) : 0;
      return {
        id: r.id,
        vehicleNumber: r.vehicleNumber,
        type: r.type,
        trips: small ? null : r.trips,
        onTripPercent: small ? null : onTripPercent,
        notOnTripPercent: small ? null : round1(100 - onTripPercent),
        masked: small,
        ...(small ? { label: MASK_LABEL } : {}),
      };
    })
    .sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber));
}

// ---- everything ----
export function buildMetrics({ cases, trips = [], hospitals = [], ambulances = [], from, to, tzOffsetMin = 0 }) {
  const tripByCase = new Map(trips.map((t) => [sid(t.emergencyCase), t]));
  const noAmbulance = cases.filter((c) => (c.timeline || []).some((t) => t.event === 'no_ambulance_available')).length;
  const allBusy = cases.filter((c) => c.allHospitalsBusy).length;
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, cases.filter((c) => c.severity === s).length]));
  return {
    range: { from: from.toISOString(), to: to.toISOString(), tzOffsetMinutes: tzOffsetMin },
    totals: { cases: cases.length, bySeverity, noAmbulanceAvailable: maskedCount(noAmbulance), allHospitalsBusy: maskedCount(allBusy) },
    casesPerDay: groupByDay(cases, { from, to, tzOffsetMin }),
    responseTimes: responseTimings(cases, tripByCase),
    goldenHour: goldenHourCompliance(cases),
    rejectionReasons: rejectionReasons(cases),
    hospitals: hospitalStats(cases, hospitals),
    ambulances: ambulanceUtilisation(trips, ambulances, { from, to }),
    notice: 'Simulated data for demonstration. Not a medical device.',
  };
}
