// A small browser-side stand-in for live readings on the patient's own screen. It is SIMULATED and labelled so on screen.
// When the monitoring phase (server-side simulation) is merged, this file is replaced by the real stream.
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const TARGET = { calm: 72, exercise: 118, emergency: 132 };

export function nextHeartRate(prev, mode = 'calm', rand = Math.random) {
  const target = TARGET[mode] ?? TARGET.calm;
  const pull = (target - prev) * 0.18;
  const noise = (rand() - 0.5) * (mode === 'calm' ? 3 : 6);
  return Math.round(clamp(prev + pull + noise, 40, 190));
}

/** R-R interval (ms between beats) from heart rate. */
export const rrInterval = (bpm) => Math.round(60000 / clamp(bpm, 20, 240));

/** Signal quality 0-100: high when calm, a little lower the faster the heart beats. Simulated. */
export const signalQuality = (bpm, rand = Math.random) => clamp(Math.round(99 - Math.max(0, bpm - 90) * 0.15 - rand() * 3), 80, 100);

export function seedHistory(n = 24, start = 72, rand = Math.random) {
  const out = [start];
  for (let i = 1; i < n; i += 1) out.push(nextHeartRate(out[i - 1], 'calm', rand));
  return out;
}
