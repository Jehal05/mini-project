import { BEAT_WIDTH, beatSeconds, ecgPath } from '../lib/ecg.js';

// A live-looking ECG line whose speed follows the heart rate. Static (still drawn) when motion is reduced.
// It is a picture of the rate, not a medical recording, so it is hidden from screen readers.
export default function EcgLine({ bpm, width = 260, height = 56, className = 'text-critical' }) {
  const beats = Math.ceil(width / BEAT_WIDTH) + 2;
  return (
    <div aria-hidden="true" className={`overflow-hidden ${className}`} style={{ width, maxWidth: '100%', height }}>
      <svg width={beats * BEAT_WIDTH} height={height} viewBox={`0 0 ${beats * BEAT_WIDTH} ${height}`} className="ecg-scroll" style={{ '--beat': `${beatSeconds(bpm)}s` }}>
        <path d={ecgPath(beats, height)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
