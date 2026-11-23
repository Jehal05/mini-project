import { STAGES, stageState } from '../lib/stages.js';
import Icon from '../ui/icons.jsx';

// Feature 78: the five stages with the time each one started. Done = tick, current = highlighted, upcoming = muted.
export default function StageTracker({ stage, stageTimes = {}, large = false }) {
  return (
    <ol className={`flex flex-wrap gap-2 ${large ? 'text-base' : 'text-xs'}`} aria-label="Trip stages">
      {STAGES.map((s) => {
        const state = stageState(stage, s.key);
        const style = { done: 'bg-low-soft text-low', current: 'bg-accent text-accent-ink', upcoming: 'bg-raised text-muted' }[state];
        return (
          <li key={s.key} className={`inline-flex items-center gap-1 rounded-ui px-2 py-1 ${style}`} aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' && <Icon name="check" size={14} />}
            <span className="font-semibold">{s.label}</span>
            {stageTimes[s.key] && <span className="tnum opacity-80">{new Date(stageTimes[s.key]).toLocaleTimeString()}</span>}
          </li>
        );
      })}
    </ol>
  );
}
