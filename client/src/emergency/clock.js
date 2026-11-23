// The server owns the countdown: the browser only displays it. These helpers turn the server's
// deadline into "seconds left" on the browser's own clock, corrected for any clock difference.

/** serverNow - clientNow, in ms. Add it to the browser's clock to get server time. */
export function clockOffset(serverNow, clientNow = Date.now()) {
  const s = Date.parse(serverNow)
  return Number.isFinite(s) ? s - clientNow : 0
}

/** Whole seconds until `deadline` (ISO string) on the server's clock; never below 0. */
export function secondsLeft(deadline, offsetMs = 0, now = Date.now()) {
  const d = Date.parse(deadline)
  return Number.isFinite(d) ? Math.max(0, Math.ceil((d - (now + offsetMs)) / 1000)) : 0
}
