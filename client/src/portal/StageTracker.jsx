import { STAGES, stageState } from '../lib/stages.js';

// Feature 78: the five stages with the time each one started.
export default function StageTracker({ stage, stageTimes = {}, large = false }) {
  return (
    <ol className={`flex flex-wrap gap-2 ${large ? 'text-base' : 'text-xs'}`} aria-label="Trip stages">
      {STAGES.map((s) => {
        const state = stageState(stage, s.key);
        const style = { done: 'bg-green-100 text-green-900', current: 'bg-blue-600 text-white', upcoming: 'bg-slate-100 text-slate-500' }[state];
        return (
          <li key={s.key} className={`rounded px-2 py-1 ${style}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="font-semibold">{s.label}</span>
            {stageTimes[s.key] && <span className="ml-1 font-mono opacity-80">{new Date(stageTimes[s.key]).toLocaleTimeString()}</span>}
          </li>
        );
      })}
    </ol>
  );
}
