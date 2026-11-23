import { useCallback, useEffect, useState } from 'react';
import { addBed, fetchBeds, removeBed, setBedStatus } from '../lib/inpatientApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input, Select } from '../ui/Form.jsx';
import { ErrorState, Skeleton, EmptyState } from '../ui/Feedback.jsx';
import Icon from '../ui/icons.jsx';

const WARDS = [['ICU', 'ICU'], ['CCU', 'CCU'], ['ED', 'Emergency'], ['GENERAL', 'General']];
const STATE = { free: ['circle', 'Free', 'text-low'], occupied: ['octagon-alert', 'Occupied', 'text-critical'], reserved: ['diamond', 'Reserved', 'text-moderate'], cleaning: ['circle-dashed', 'Cleaning', 'text-muted'] };

// Feature 85: every bed with a shape and a word for its state. Staff can reserve, free or clean a bed that is not occupied.
export default function BedsBoard({ canEdit, reload: externalReload }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ward: 'GENERAL', label: '' });
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetchBeds().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load, externalReload]);

  async function act(fn) { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function add(e) {
    e.preventDefault(); setBusy(true); setFields({});
    try { await addBed(form); setForm({ ...form, label: '' }); await load(); } catch (err) { setFields(err.fields ?? {}); if (!err.fields || !Object.keys(err.fields).length) setError(err.message); } finally { setBusy(false); }
  }

  if (!data && !error) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  return (
    <div className="space-y-4">
      {error && <ErrorState title="That did not go through" onRetry={load}>{error}</ErrorState>}
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {WARDS.map(([id, label]) => {
            const c = data.counts[id] ?? { total: 0, free: 0 };
            return <div key={id} className="glass rounded-ui border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="tnum mt-1 text-2xl font-semibold">{c.free}<span className="text-sm font-normal text-muted"> free of {c.total}</span></p></div>;
          })}
        </div>
      )}
      {canEdit && (
        <Panel title="Add a bed">
          <form onSubmit={add} className="flex flex-wrap items-start gap-3">
            <Field label="Ward" error={fields.ward}>{(p) => <Select {...p} value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })}>{WARDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Bed label" hint="For example CCU-3" error={fields.label}>{(p) => <Input {...p} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={30} />}</Field>
            <Button type="submit" busy={busy} className="mt-6" icon="check">Add bed</Button>
          </form>
        </Panel>
      )}
      {data && data.beds.length === 0 && <EmptyState icon="inbox" title="No beds yet">{canEdit ? 'Add the first bed above.' : 'Ask hospital staff to add beds.'}</EmptyState>}
      {data && data.beds.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Beds">
          {data.beds.map((b) => {
            const [icon, word, tone] = STATE[b.status] ?? STATE.free;
            return (
              <li key={b.id} className="glass rounded-ui border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{b.label} <span className="text-xs font-normal text-muted">{WARDS.find((w) => w[0] === b.ward)?.[1]}</span></p>
                  <span className={`flex items-center gap-1 text-sm font-semibold ${tone}`}><Icon name={icon} size={16} />{word}</span>
                </div>
                {canEdit && b.status !== 'occupied' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.status !== 'free' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => setBedStatus(b.id, 'free'))}>Mark free</Button>}
                    {b.status !== 'reserved' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => setBedStatus(b.id, 'reserved'))}>Reserve</Button>}
                    {b.status !== 'cleaning' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => setBedStatus(b.id, 'cleaning'))}>Needs cleaning</Button>}
                    <Button size="sm" variant="quiet" disabled={busy} onClick={() => act(() => removeBed(b.id))}>Remove</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
