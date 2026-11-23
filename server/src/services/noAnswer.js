// Pure logic for the no-answer sweep (supports feature 60).
// Returns hospitals that were notified, did not reject, are past the timeout, and have not been handled yet.
// "Handled" is recorded in case.timedOutHospitals, so running the sweep twice never repeats the work.
export function findNewTimeouts({ notified = [], rejected = [], timedOut = [], now = Date.now(), timeoutMs }) {
  const skip = new Set([...rejected, ...timedOut].map(String));
  return notified
    .filter((n) => !skip.has(String(n.hospital)) && now - new Date(n.notifiedAt).getTime() >= timeoutMs)
    .map((n) => String(n.hospital));
}
