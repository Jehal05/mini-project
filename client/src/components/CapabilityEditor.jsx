// Feature 58 demo controls: change a hospital's capacity; the server broadcasts it and every open screen re-ranks.
import { useEffect, useMemo, useState } from 'react';
import { updateCapabilities, errorMessage } from '../api/hospitals.js';

const COUNT_FIELDS = [
  ['icuBedsFree', 'ICU beds free'],
  ['ccuBedsFree', 'CCU beds free'],
  ['alsAmbulances', 'ALS ambulances'],
];

function Stepper({ id, label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm text-text-muted">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-ghost h-8 w-8 p-0"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={0}
          max={999}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))))}
          className="w-14 rounded-lg border border-white/15 bg-ink-950/60 px-2 py-1 text-center font-mono text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          className="btn-ghost h-8 w-8 p-0"
          onClick={() => onChange(Math.min(999, value + 1))}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className={checked ? 'text-good' : 'text-text-muted'}>{checked ? 'Yes' : 'No'}</span>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[#00C2FF]"
        />
      </span>
    </label>
  );
}

const formFrom = (h) => ({
  cathLab: Boolean(h?.capabilities?.cathLab),
  cardiologistOnDuty: Boolean(h?.capabilities?.cardiologistOnDuty),
  icuBedsFree: h?.capabilities?.icuBedsFree ?? 0,
  ccuBedsFree: h?.capabilities?.ccuBedsFree ?? 0,
  alsAmbulances: h?.capabilities?.alsAmbulances ?? 0,
});

export default function CapabilityEditor({ hospitals, onSaved }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(formFrom(null));
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  const sorted = useMemo(
    () => [...hospitals].sort((a, b) => a.name.localeCompare(b.name)),
    [hospitals]
  );
  const selected = sorted.find((h) => h._id === selectedId) || null;

  // Default to the first hospital; reload the form when the live data for it changes.
  useEffect(() => {
    if (!selectedId && sorted.length) setSelectedId(sorted[0]._id);
  }, [sorted, selectedId]);

  useEffect(() => {
    if (selected) setForm(formFrom(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.capabilities?.updatedAt]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!selected) return;
    setStatus({ state: 'saving', message: '' });
    try {
      await updateCapabilities(selected._id, form);
      setStatus({ state: 'saved', message: 'Saved. All open screens re-rank now.' });
      onSaved?.();
    } catch (err) {
      setStatus({ state: 'error', message: errorMessage(err) || 'Save failed' });
    }
  }

  return (
    <section className="glass p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-semibold"
        aria-expanded={open}
        aria-controls="capability-editor"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Demo controls: hospital capacity</span>
        <span className="text-text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div id="capability-editor" className="mt-3 space-y-3">
          {sorted.length === 0 ? (
            <p className="text-xs text-text-muted">Set a location first to load hospitals.</p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-text-muted">Hospital</span>
                <select
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setStatus({ state: 'idle', message: '' });
                  }}
                  className="w-full rounded-lg border border-white/15 bg-ink-950/60 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                >
                  {sorted.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>

              <Toggle id="cap-cathlab" label="Cath lab" checked={form.cathLab} onChange={set('cathLab')} />
              <Toggle
                id="cap-cardio"
                label="Cardiologist on duty"
                checked={form.cardiologistOnDuty}
                onChange={set('cardiologistOnDuty')}
              />
              {COUNT_FIELDS.map(([key, label]) => (
                <Stepper key={key} id={`cap-${key}`} label={label} value={form[key]} onChange={set(key)} />
              ))}

              <div className="flex items-center gap-3">
                <button type="button" className="btn-primary" onClick={save} disabled={status.state === 'saving'}>
                  {status.state === 'saving' ? 'Saving…' : 'Save capacity'}
                </button>
                {status.message && (
                  <p
                    role="status"
                    className={`text-xs ${status.state === 'error' ? 'text-warn' : 'text-good'}`}
                  >
                    {status.message}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-text-muted">
                Demo only. Later this comes from the hospital's bed and doctor modules, and only hospital admins can change it.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
