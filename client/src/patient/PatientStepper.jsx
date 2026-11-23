import Icon from '../ui/icons.jsx';
import { PATIENT_STEPS } from '../lib/patientStages.js';

// Five plain-language steps. Done = tick, current = filled ring, upcoming = empty ring. Always text too.
export default function PatientStepper({ step }) {
  return (
    <ol aria-label="Progress of your emergency" className="space-y-0">
      {PATIENT_STEPS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'upcoming';
        return (
          <li key={s.id} aria-current={state === 'current' ? 'step' : undefined} className="relative flex gap-4 pb-5 last:pb-0">
            {i < PATIENT_STEPS.length - 1 && <span aria-hidden="true" className={`absolute left-[1.0625rem] top-9 h-[calc(100%-2.25rem)] w-0.5 ${i < step ? 'bg-accent' : 'bg-line'}`} />}
            <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 ${state === 'done' ? 'border-accent bg-accent text-accent-ink' : state === 'current' ? 'border-accent bg-surface text-accent ring-4 ring-accent/20' : 'border-line bg-surface text-muted'}`}>
              {state === 'done' ? <Icon name="check" size={18} /> : <span className="tnum text-sm font-bold">{i + 1}</span>}
            </span>
            <div className="pt-1">
              <p className={`text-base ${state === 'upcoming' ? 'text-muted' : 'font-semibold text-ink'}`}>{s.label}</p>
              <span className="sr-only">{state === 'done' ? 'Done' : state === 'current' ? 'Happening now' : 'Not yet'}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
