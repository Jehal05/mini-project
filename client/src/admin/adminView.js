// Pure helpers of the central admin screens, kept apart so they can be tested without a browser.

export const KEYS = ['hr', 'sys', 'dia', 'spo2', 'temp', 'rr'];
export const CRIT = [['below', 'Critical below'], ['above', 'Critical above'], ['atOrAbove', 'Critical at or above']];
const num = (v) => (v === '' || v === undefined ? undefined : Number(v));

/** Turns the edit boxes into the overrides the server accepts: only what differs from the defaults. */
export function overridesFrom(form, defaults) {
  const out = {};
  for (const k of KEYS) {
    const d = defaults[k]; const f = form[k]; const o = {};
    const lo = num(f.lo); const hi = num(f.hi);
    if (lo !== d.normal[0] || hi !== d.normal[1]) o.normal = [lo, hi];
    const crit = {}; let changed = false;
    for (const [c] of CRIT) { const v = num(f[c]); if (v !== undefined) crit[c] = v; if (v !== d.critical[c]) changed = true; }
    if (changed) o.critical = crit;
    if (Object.keys(o).length) out[k] = o;
  }
  return out;
}
export const formFrom = (effective) => Object.fromEntries(KEYS.map((k) => {
  const t = effective[k];
  return [k, { lo: String(t.normal[0]), hi: String(t.normal[1]), ...Object.fromEntries(CRIT.map(([c]) => [c, t.critical[c] === undefined ? '' : String(t.critical[c])])) }];
}));

/** Drops empty optional boxes and turns the coordinates into numbers. */
export function registrationBody(f) {
  const body = { ...f, latitude: f.latitude === '' ? undefined : Number(f.latitude), longitude: f.longitude === '' ? undefined : Number(f.longitude) };
  for (const k of ['address', 'area', 'phone']) if (!body[k]) delete body[k];
  return body;
}

export const actionLabel = (a) => String(a ?? '').replace(/^admin_/, '').replace(/_/g, ' ');
export const detail = (e) => {
  const m = e.meta ?? {};
  return [e.resourceRef, m.summary, m.name, m.adminEmail].filter(Boolean).join(' · ');
};

/** Bounds covering everything with a location, or null. */
export const boundsOf = (o) => {
  const pts = [...o.hospitals, ...o.ambulances, ...o.cases].map((x) => [x.location.latitude, x.location.longitude]);
  return pts.length ? pts : null;
};
