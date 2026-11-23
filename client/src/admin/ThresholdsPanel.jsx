import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { ErrorState, Skeleton, Toast } from '../ui/Feedback.jsx';

import { CRIT, KEYS, formFrom, overridesFrom } from './adminView.js';

// Feature 36: change the demo thresholds for everyone, or for one patient. Every change is written to the audit log.
export default function ThresholdsPanel({ token }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState('');

  const load = useCallback(async () => {
    try { const c = await adminFetch(token, '/detection/config'); setCfg(c); setForm(formFrom(c.effective.thresholds ?? c.effective)); setError(''); } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function save(url, body, done) {
    setBusy(true); setError(''); setNote('');
    try { await adminFetch(token, url, { method: 'PUT', body }); setNote(done); await load(); } catch (e) { setError(e.errors?.join(' ') || e.message); } finally { setBusy(false); }
  }
  if (error && !cfg) return <ErrorState title="Could not load thresholds" onRetry={load}>{error}</ErrorState>;
  if (!cfg || !form) return <Skeleton className="h-64" />;
  const defaults = cfg.defaults.thresholds;
  const set = (k, field, v) => setForm({ ...form, [k]: { ...form[k], [field]: v } });

  return (
    <div className="space-y-4">
      <Panel title="Detection thresholds">
        <p className="mb-3 text-sm text-muted">Demo values, not clinical criteria. Outside the normal range but not critical counts as a warning. Changes apply to everyone straight away.</p>
        <form onSubmit={(e) => { e.preventDefault(); save('/detection/config', { thresholds: overridesFrom(form, defaults) }, 'Thresholds saved and logged.'); }} className="space-y-4">
          {KEYS.map((k) => (
            <fieldset key={k} className="rounded-ui border border-line p-3">
              <legend className="px-1 text-sm font-semibold">{defaults[k].label} ({defaults[k].unit})</legend>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Field label="Normal from">{(p) => <Input type="number" step="any" value={form[k].lo} onChange={(e) => set(k, 'lo', e.target.value)} required {...p} />}</Field>
                <Field label="Normal to">{(p) => <Input type="number" step="any" value={form[k].hi} onChange={(e) => set(k, 'hi', e.target.value)} required {...p} />}</Field>
                {CRIT.filter(([c]) => defaults[k].critical[c] !== undefined).map(([c, label]) => (
                  <Field key={c} label={label}>{(p) => <Input type="number" step="any" value={form[k][c]} onChange={(e) => set(k, c, e.target.value)} required {...p} />}</Field>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy}>Save thresholds</Button>
            <Button type="button" variant="secondary" onClick={() => save('/detection/config', { thresholds: {} }, 'Back to the default thresholds.')}>Reset to defaults</Button>
          </div>
        </form>
        {note && <div className="mt-3"><Toast tone="info" onClose={() => setNote('')}>{note}</Toast></div>}
        {error && <div className="mt-3"><Toast tone="critical" onClose={() => setError('')}>{error}</Toast></div>}
      </Panel>

      <Panel title="One patient only">
        <p className="mb-3 text-sm text-muted">Give one patient their own limits, for example a lower resting heart rate. Uses the boxes above as the new values. Leave the ID and press Remove to go back to the normal limits.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Patient ID" hint="For example HT-2026-0001">{(p) => <Input value={patient} onChange={(e) => setPatient(e.target.value.toUpperCase())} maxLength={20} {...p} />}</Field>
          <Button busy={busy} disabled={!patient} onClick={() => save(`/detection/patients/${encodeURIComponent(patient)}/thresholds`, { thresholds: overridesFrom(form, defaults) }, `Limits saved for ${patient}.`)}>Set for this patient</Button>
          <Button variant="secondary" disabled={!patient} onClick={() => save(`/detection/patients/${encodeURIComponent(patient)}/thresholds`, { thresholds: {} }, `Own limits removed for ${patient}.`)}>Remove</Button>
        </div>
      </Panel>

      <Panel title="Recent changes">
        <ul className="space-y-1 text-sm">
          {(cfg.changes ?? []).slice().reverse().map((c, i) => <li key={i}>{new Date(c.at).toLocaleString()}: {c.summary} ({c.scope}, {c.actorRole})</li>)}
          {!cfg.changes?.length && <li className="text-muted">No changes yet.</li>}
        </ul>
      </Panel>
    </div>
  );
}
