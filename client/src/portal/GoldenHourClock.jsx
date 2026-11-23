import { formatMinutes } from '../lib/time.js';
import { useNow } from '../lib/useNow.js';

// Feature 105. The server computes the stages. Between updates we keep running stages ticking locally,
// and a stage turns red (with the words "over target") when it runs past its target.
export default function GoldenHourClock({ stages }) {
  const now = useNow();
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const elapsed =
          s.status === 'running' ? Math.max(s.elapsedMin, (now - new Date(s.startedAt).getTime()) / 60000) : s.elapsedMin;
        const overdue = elapsed > s.targetMin;
        const pct = Math.min(100, (elapsed / s.targetMin) * 100);
        return (
          <div key={s.key} className={`rounded-ui border p-2 text-sm ${overdue ? 'border-critical bg-critical-soft' : 'border-line bg-surface'}`}>
            <div className="flex justify-between gap-2">
              <span className="font-semibold text-ink">{s.label}</span>
              <span className={`tnum ${overdue ? 'font-bold text-critical' : 'text-ink'}`}>
                {s.status === 'not_started' ? 'not started' : formatMinutes(elapsed)} of {s.targetMin} min
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-line">
              <div className={`h-1.5 rounded-full ${overdue ? 'bg-critical' : s.status === 'done' ? 'bg-low' : 'bg-accent'}`} style={{ width: `${s.status === 'not_started' ? 0 : pct}%` }} />
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {s.status === 'done' && (overdue ? 'Finished late' : 'Done on time')}
              {s.status === 'running' && (overdue ? 'Over target' : 'Running')}
              {s.status === 'stopped' && 'Stopped when the case closed'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
