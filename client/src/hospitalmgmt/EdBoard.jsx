import { useCallback, useEffect, useState } from 'react';
import { bayAction, createBay, deleteBay, fetchEd } from '../lib/hospitalApi.js';
import Button from '../ui/Button.jsx';
import { Panel, Badge } from '../ui/Surface.jsx';
import { Field, Input, Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback.jsx';
import Icon from '../ui/icons.jsx';
import { BAY_STATE } from './labels.js';

const TRIAGE = [[1, '1 · Immediate'], [2, '2 · Very urgent'], [3, '3 · Urgent'], [4, '4 · Less urgent'], [5, '5 · Non-urgent']];

// Feature 86: the emergency department's bays and the patients on their way in. Bay changes are ordinary button presses, not live-pushed.
export default function EdBoard({ canEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [fields, setFields] = useState({});
  const [filling, setFilling] = useState(null); // bay id being filled
  const [fill, setFill] = useState({ triageLevel: 3, patientId: '', complaint: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetchEd().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, onFields) {
    setBusy(true); setError('');
    try { setData(await fn()); return true; } catch (e) { if (onFields && Object.keys(e.fields ?? {}).length) onFields(e.fields); else setError(e.message); return false; } finally { setBusy(false); }
  }
  const add = async (e) => { e.preventDefault(); setFields({}); if (await run(() => createBay(label), setFields)) setLabel(''); };
  async function occupy(e, id) {
    e.preventDefault(); setFields({});
    const ok = await run(() => bayAction(id, { action: 'occupy', triageLevel: Number(fill.triageLevel), patientId: fill.patientId || undefined, complaint: fill.complaint || undefined }), setFields);
    if (ok) { setFilling(null); setFill({ triageLevel: 3, patientId: '', complaint: '' }); }
  }

  if (!data && !error) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      {error && <ErrorState title="That did not go through" onRetry={load}>{error}</ErrorState>}
      {data && (
        <Panel title="On their way in">
          {data.arriving.length === 0 ? <p className="text-sm text-muted">No emergency patients are on their way to you.</p> : (
            <ul className="divide-y divide-line/60 text-sm">
              {data.arriving.map((c) => (
                <li key={c.caseId} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone={c.severity === 'critical' ? 'critical' : 'high'}>{c.severity}</Badge>
                  <span>{c.patientName ?? 'Patient'}{c.patientId ? ` (${c.patientId})` : ''}</span>
                  <span className="text-muted">{c.hasAmbulance ? 'Ambulance assigned' : 'Waiting for an ambulance'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      {canEdit && (
        <Panel title="Add a bay">
          <form onSubmit={add} className="flex flex-wrap items-start gap-3">
            <Field label="Bay label" hint="For example RESUS-1" error={fields.label}>{(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} />}</Field>
            <Button type="submit" busy={busy} className="mt-6" icon="check">Add bay</Button>
          </form>
        </Panel>
      )}
      {data && data.bays.length === 0 && <EmptyState icon="inbox" title="No bays yet">{canEdit ? 'Add the first bay above.' : 'Ask hospital staff to add bays.'}</EmptyState>}
      {data && data.bays.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.bays.map((b) => {
            const [icon, word, tone] = BAY_STATE[b.status] ?? BAY_STATE.vacant;
            return (
              <li key={b.id} className="glass rounded-ui border border-line p-3">
                <div className="flex items-center justify-between"><span className="font-semibold">{b.label}</span><span className={`flex items-center gap-1 text-sm ${tone}`}><Icon name={icon} size={16} />{word}</span></div>
                {b.status === 'occupied' && <p className="mt-1 text-sm">Triage {b.triageLevel}{b.patientId ? ` · ${b.patientId}` : ''}{b.complaint ? ` · ${b.complaint}` : ''}</p>}
                {canEdit && filling === b.id ? (
                  <form onSubmit={(e) => occupy(e, b.id)} className="mt-2 space-y-2">
                    <Field label="Triage level" error={fields.triageLevel}>{(p) => <Select {...p} value={fill.triageLevel} onChange={(e) => setFill({ ...fill, triageLevel: e.target.value })}>{TRIAGE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
                    <Field label="Patient ID" hint="Optional, like HT-2026-0001" error={fields.patientId}>{(p) => <Input {...p} value={fill.patientId} onChange={(e) => setFill({ ...fill, patientId: e.target.value })} />}</Field>
                    <Field label="Complaint" hint="Optional" error={fields.complaint}>{(p) => <Input {...p} value={fill.complaint} maxLength={200} onChange={(e) => setFill({ ...fill, complaint: e.target.value })} />}</Field>
                    <div className="flex gap-2"><Button type="submit" size="sm" busy={busy}>Occupy bay</Button><Button size="sm" variant="quiet" onClick={() => setFilling(null)}>Cancel</Button></div>
                  </form>
                ) : canEdit && (
                  <div className="mt-2 flex gap-2">
                    {b.status === 'vacant' && <><Button size="sm" disabled={busy} onClick={() => { setFilling(b.id); setFields({}); }}>Occupy</Button><Button size="sm" variant="quiet" disabled={busy} onClick={() => run(() => deleteBay(b.id))}>Remove</Button></>}
                    {b.status === 'occupied' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => bayAction(b.id, { action: 'clear' }))}>Patient left</Button>}
                    {b.status === 'cleaning' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => bayAction(b.id, { action: 'ready' }))}>Mark ready</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">Simulated data for demonstration. Not a medical device.</p>
    </div>
  );
}
