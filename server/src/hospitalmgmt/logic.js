// Pure rules for the hospital management screens, kept free of the database so they can be tested on their own.
const sid = (v) => String(v?.hospital ?? v);
const has = (list, id) => (list ?? []).some((x) => sid(x) === String(id));

/** How a case looks from ONE hospital's side. */
export function outcomeOf(c, hospitalId) {
  const me = String(hospitalId);
  if (c.status === 'cancelled') return 'cancelled';
  if (c.hospital && String(c.hospital) === me) return 'accepted';
  if (has(c.rejectedHospitals, me)) return 'rejected';
  if (has(c.timedOutHospitals, me)) return 'no_answer';
  if (c.hospital) return 'elsewhere';
  if (c.status === 'unresolved') return 'unresolved';
  return 'waiting';
}

/** The database filter for a history tab. Always starts from "this hospital was notified about the case". */
export function historyFilter(hospitalId, status = 'all') {
  const base = { 'notifiedHospitals.hospital': hospitalId };
  switch (status) {
    case 'accepted': return { ...base, hospital: hospitalId, status: { $ne: 'cancelled' } };
    case 'rejected': return { ...base, rejectedHospitals: hospitalId, status: { $ne: 'cancelled' } };
    case 'no_answer': return { ...base, timedOutHospitals: hospitalId, rejectedHospitals: { $ne: hospitalId }, status: { $ne: 'cancelled' } };
    case 'elsewhere': return { ...base, hospital: { $exists: true, $nin: [hospitalId] }, status: { $ne: 'cancelled' } };
    case 'cancelled': return { ...base, status: 'cancelled' };
    default: return base;
  }
}

/** Whole seconds between two times, or null when either is missing. */
export const secondsBetween = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)) : null);

/** Average seconds from "this hospital was alerted" to "this hospital accepted", over cases it accepted. null when there are none. */
export function averageResponse(cases, hospitalId) {
  const times = [];
  for (const c of cases) {
    const note = (c.notifiedHospitals ?? []).find((n) => sid(n) === String(hospitalId));
    const s = secondsBetween(note?.notifiedAt, c.acceptedAt);
    if (s !== null) times.push(s);
  }
  return times.length ? { seconds: Math.round(times.reduce((a, b) => a + b, 0) / times.length), cases: times.length } : { seconds: null, cases: 0 };
}

/** Bed counts per ward from grouped rows [{ _id: { ward, status }, n }]. Free beds are the ones that can take a patient now. */
export function summariseBeds(rows) {
  const wards = {};
  let free = 0;
  let total = 0;
  for (const { _id, n } of rows) {
    const w = (wards[_id.ward] ??= { total: 0, free: 0, occupied: 0, reserved: 0, cleaning: 0 });
    w.total += n; w[_id.status] = (w[_id.status] ?? 0) + n;
    total += n; if (_id.status === 'free') free += n;
  }
  return { wards, free, total };
}

/** Legal bay moves: a bay is filled from vacant, cleared into cleaning, and made ready again from cleaning. */
export const BAY_MOVES = Object.freeze({ occupy: 'vacant', clear: 'occupied', ready: 'cleaning' });
