import { formatMinutes } from '../lib/time.js';
import { useNow } from '../lib/useNow.js';

// Feature 105. The server computes the stages. Between updates we keep running stages ticking locally,
// and a stage turns red when it runs past its target.
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
          <div key={s.key} className={`rounded border p-2 text-sm ${overdue ? 'border-red-600 bg-red-50' : 'border-slate-200'}`}>
            <div className="flex justify-between">
              <span className="font-medium">{s.label}</span>
              <span className={`font-mono ${overdue ? 'font-bold text-red-700' : ''}`}>
                {s.status === 'not_started' ? 'not started' : formatMinutes(elapsed)} / {s.targetMin} min
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-slate-200">
              <div className={`h-1.5 rounded ${overdue ? 'bg-red-600' : s.status === 'done' ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${s.status === 'not_started' ? 0 : pct}%` }} />
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {s.status === 'done' && (overdue ? 'Finished late' : 'Done on time')}
              {s.status === 'running' && (overdue ? 'OVER TARGET' : 'Running')}
              {s.status === 'stopped' && 'Stopped when the case closed'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
