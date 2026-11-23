import { useNow } from '../lib/useNow.js';
import { formatCountdown } from '../lib/time.js';
import { ProgressRing } from '../ui/Data.jsx';

// Response countdown as a ring. totalSeconds matches the server default NO_ANSWER_TIMEOUT_SECONDS (120).
// Turns red under 30 seconds; the time is always written inside the ring too.
export default function CountdownRing({ respondBy, totalSeconds = 120, size = 56 }) {
  const now = useNow();
  if (!respondBy) return null;
  const left = new Date(respondBy).getTime() - now;
  const urgent = left < 30000;
  return (
    <ProgressRing fraction={left / (totalSeconds * 1000)} size={size} tone={urgent ? 'critical' : 'accent'}
      label={left < 0 ? 'Response time is overdue' : `Respond within ${Math.ceil(left / 1000)} seconds`}>
      <span className={urgent ? 'text-critical' : ''}>{formatCountdown(left)}</span>
    </ProgressRing>
  );
}
