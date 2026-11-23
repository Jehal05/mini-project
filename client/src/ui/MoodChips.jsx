// "How do you feel today?" A radio group, so it works with the keyboard and a screen reader without extra code.
export const MOODS = [
  ['normal', 'Normal', 'M8 14h8'], ['calm', 'Calm', 'M8 14q4 3 8 0'], ['sad', 'Sad', 'M8 16q4-3 8 0'],
  ['tired', 'Tired', 'M8 15h8'], ['happy', 'Happy', 'M8 13q4 5 8 0'], ['stressed', 'Stressed', 'M8 16q2-2 4 0t4 0'],
];

export default function MoodChips({ value, onChange, name = 'mood', legend = 'How do you feel today?' }) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {MOODS.map(([id, label, mouth]) => (
          <label key={id} className="flex min-w-[4.25rem] cursor-pointer flex-col items-center gap-1 text-xs font-semibold text-muted">
            <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} className="peer sr-only" />
            <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-raised text-ink transition-colors peer-checked:border-transparent peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M9 9.5v.5M15 9.5v.5" /><path d={mouth} />
              </svg>
            </span>
            <span className="peer-checked:text-ink">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
