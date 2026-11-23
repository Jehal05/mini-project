// Pure decision logic for feature 60 (no database imports).
const sid = (v) => String(v?.hospital ?? v);

// A hospital is "tried" once notified or rejected.
// A notified hospital that has not answered within timeoutMs is "unresponsive" and is skipped.
export function pickNextHospital({ candidates = [], rejected = [], notified = [], now = Date.now(), timeoutMs }) {
  const rejectedSet = new Set(rejected.map(sid));
  const tried = new Set([...rejectedSet, ...notified.map(sid)]);

  const waiting = notified.filter((n) => !rejectedSet.has(sid(n)));
  const isLate = (n) => now - new Date(n.notifiedAt).getTime() >= timeoutMs;
  const unresponsive = waiting.filter(isLate).map(sid);
  const pending = waiting.filter((n) => !isLate(n)).map(sid);

  const next = candidates.map(sid).find((id) => !tried.has(id)) ?? null;
  return { next, unresponsive, pending, exhausted: next === null && pending.length === 0 };
}

