// One heartbeat drawn as a PQRST trace, repeated to fill the width. Pure.
const BEAT = [[0, 0], [8, 0], [11, -3], [14, 0], [20, 0], [22, 2], [25, -16], [28, 9], [30, 0], [36, 0], [41, -4], [47, 0], [60, 0]];
export const BEAT_WIDTH = 60;

/** Path for `beats` beats on a baseline. Height scales the spike. */
export function ecgPath(beats = 4, height = 40) {
  const mid = height / 2; const k = height / 40; let d = '';
  for (let b = 0; b < beats; b += 1) {
    BEAT.forEach(([x, y], i) => { d += `${b === 0 && i === 0 ? 'M' : 'L'} ${(x + b * BEAT_WIDTH).toFixed(1)} ${(mid + y * k).toFixed(1)} `; });
  }
  return d.trim();
}

/** Seconds one beat takes at a given rate. Falls back to 75 bpm for a missing or silly value. */
export function beatSeconds(bpm) {
  const v = typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= 20 && bpm <= 240 ? bpm : 75;
  return +(60 / v).toFixed(3);
}

/** 0..~1.7 "lub-dub" shape for one beat; phase is 0 (start of beat) to 1. The 3D heart scales by this. */
export function pulseAt(phase) {
  const p = ((phase % 1) + 1) % 1;
  return Math.exp(-(((p - 0.1) / 0.05) ** 2)) + 0.7 * Math.exp(-(((p - 0.32) / 0.06) ** 2));
}
