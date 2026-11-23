// Pure helpers for the live reading stream from the server's monitoring simulator.
// A `vitals:update` message looks like { patientId, at, vitals: { hr, sys, dia, spo2, temp, rr }, statuses, status, scenario, simulated: true }.
export const HISTORY_LEN = 24;
export const EMPTY_LIVE = Object.freeze({ bpm: null, history: [], vitals: null, statuses: {}, scenario: null, at: null });

const STATUS_TO_UI = { normal: 'normal', warning: 'warning', critical: 'critical' };
export const uiStatus = (s) => STATUS_TO_UI[s] ?? 'unknown';

/** Folds one update into the live state. Keeps the last HISTORY_LEN heart rates. Ignores a malformed message. */
export function applyVitals(state, msg) {
  const hr = msg?.vitals?.hr;
  if (!Number.isFinite(hr)) return state;
  return { bpm: Math.round(hr), history: [...state.history, Math.round(hr)].slice(-HISTORY_LEN), vitals: msg.vitals, statuses: msg.statuses ?? {}, scenario: msg.scenario ?? null, at: msg.at ?? null };
}

/** Detection levels in words. A shape and a word, never colour alone (the screen adds the shape). */
export const LEVEL_WORD = { 0: 'No alert', 1: 'Watch', 2: 'Urgent', 3: 'Critical' };
export const levelOf = (d) => (Number.isInteger(d?.level) && d.level >= 0 && d.level <= 3 ? d.level : 0);

/** Why the screen shows what it shows: server stream, or a browser stand-in. */
export function sourceNote(source) {
  if (source === 'server') return 'Live from the server\'s monitoring simulator. Simulated data.';
  if (source === 'connecting') return 'Connecting to the monitoring simulator…';
  return 'Simulated in your browser (not connected to the monitoring simulator).';
}
