import { useNow } from '../lib/useNow.js';
import { formatCountdown } from '../lib/time.js';

// Time left to respond. Turns red under 30 seconds and shows a minus sign once overdue.
export default function Countdown({ respondBy }) {
  const now = useNow();
  if (!respondBy) return null;
  const left = new Date(respondBy).getTime() - now;
  return (
    <span className={`font-mono text-sm font-bold ${left < 30000 ? 'text-red-700' : 'text-slate-700'}`} title="Time left to respond">
      {formatCountdown(left)}
    </span>
  );
}
