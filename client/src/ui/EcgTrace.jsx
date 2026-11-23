// The signature element: a PQRST heartbeat trace. In the top bar it doubles as the connection indicator
// (draws a beat when connected, dashes while reconnecting, flat dashes when offline) and always has a text label.
const BEAT = 'M0 20 H24 q4 -6 8 0 H40 l3 4 l5 -22 l5 28 l3 -10 H70 q6 -9 12 0 H110';
const FLAT = 'M0 20 H110';

export default function EcgTrace({ state = 'live', width = 96, height = 28, className = '' }) {
  const d = state === 'offline' ? FLAT : BEAT;
  const cls = state === 'live' ? '' : state === 'connecting' ? 'is-connecting' : 'is-offline';
  return (
    <svg width={width} height={height} viewBox="0 0 110 40" fill="none" aria-hidden="true" className={`text-accent ${className}`}>
      <path d={d} stroke="currentColor" strokeWidth="2.500" strokeLinecap="round" strokeLinejoin="round"
        className={`ecg-line ${cls}`} pathLength={state === 'live' ? 900 : undefined} />
    </svg>
  );
}
