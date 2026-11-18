// Synthetic ECG shape (feature 26), modelled on the ECGSYN idea (McSharry et al., 2003):
// each wave of one heartbeat (P, Q, R, S, T) is a Gaussian bump at a fixed point
// in the beat. For display only: it cannot identify a real heart attack.

const WAVES = [
  { name: 'P', at: 0.18, amp: 0.12, width: 0.025 },
  { name: 'Q', at: 0.355, amp: -0.12, width: 0.009 },
  { name: 'R', at: 0.38, amp: 1.0, width: 0.011 },
  { name: 'S', at: 0.405, amp: -0.24, width: 0.011 },
  { name: 'T', at: 0.64, amp: 0.3, width: 0.045 },
]

/** Height of the trace at a point in the beat (phase 0..1). Roughly -0.25..1. */
export function ecgSample(phase) {
  const p = ((phase % 1) + 1) % 1
  let y = 0
  for (const w of WAVES) {
    const d = p - w.at
    y += w.amp * Math.exp(-(d * d) / (2 * w.width * w.width))
  }
  return y
}

/** Seconds per beat at a heart rate. */
export const beatSeconds = (bpm) => 60 / Math.max(20, bpm || 60)

/** Points for a static strip of `seconds` at `bpm` (used when motion is reduced or paused). */
export function staticTrace(bpm, seconds, samplesPerSecond = 120) {
  const pts = []
  const n = Math.round(seconds * samplesPerSecond)
  for (let i = 0; i <= n; i += 1) {
    const t = i / samplesPerSecond
    pts.push({ t, y: ecgSample(t / beatSeconds(bpm)) })
  }
  return pts
}

export { WAVES }
