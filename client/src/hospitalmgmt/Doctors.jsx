import { useCallback, useEffect, useState } from 'react';
import { createDoctor, fetchStaff, updateDoctor } from '../lib/hospitalApi.js';
import Button from '../ui/Button.jsx';
import { Panel, Badge } from '../ui/Surface.jsx';
import { Field, Input, Select, Checkbox } from '../ui/Form.jsx';
import { Table } from '../ui/Data.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { SPECIALTY_LABELS } from './labels.js';

// Feature 83: the doctor roster and who is on duty. A cardiologist on duty is what makes the hospital rank higher for cardiac cases.
export default function Doctors({ canEdit }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', specialty: 'cardiologist', phone: '', onDuty: false });
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetchStaff().then((d) => { setRows(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function act(fn) { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function add(e) {
    e.preventDefault(); setBusy(true); setFields({});
    try { await createDoctor({ ...form, phone: form.phone || undefined }); setForm({ ...form, name: '', phone: '', onDuty: false }); await load(); } catch (err) { setFields(err.fields ?? {}); if (!Object.keys(err.fields ?? {}).length) setError(err.message); } finally { setBusy(false); }
  }

  if (!rows && !error) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      {error && <ErrorState title="That did not go through" onRetry={load}>{error}</ErrorState>}
      {canEdit && (
        <Panel title="Add a doctor">
          <form onSubmit={add} className="flex flex-wrap items-start gap-3">
            <Field label="Name" error={fields.name}>{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />}</Field>
            <Field label="Specialty" error={fields.specialty}>{(p) => <Select {...p} value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}>{Object.entries(SPECIALTY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Phone" hint="Optional" error={fields.phone}>{(p) => <Input {...p} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
            <div className="mt-6"><Checkbox label="On duty now" checked={form.onDuty} onChange={(e) => setForm({ ...form, onDuty: e.target.checked })} /></div>
            <Button type="submit" busy={busy} className="mt-6" icon="check">Add doctor</Button>
          </form>
        </Panel>
      )}
      <Panel title="Doctors">
        <Table caption="Doctors at this hospital" rowKey={(r) => r.id} empty={canEdit ? 'No doctors yet. Add the first one above.' : 'No doctors have been added.'}
          rows={rows ?? []}
          columns={[
            { key: 'name', label: 'Name', render: (r) => <span className={r.isActive ? '' : 'text-muted line-through'}>{r.name}</span> },
            { key: 'specialty', label: 'Specialty', render: (r) => SPECIALTY_LABELS[r.specialty] ?? r.specialty },
            { key: 'duty', label: 'Duty', render: (r) => !r.isActive ? <Badge>Left</Badge> : r.onDuty ? <Badge tone="low" icon="check">On duty</Badge> : <Badge>Off duty</Badge> },
            ...(canEdit ? [{ key: 'act', label: 'Actions', render: (r) => r.isActive ? (
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => updateDoctor(r.id, { onDuty: !r.onDuty }))}>{r.onDuty ? 'Go off duty' : 'Go on duty'}</Button>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => window.confirm(`Mark ${r.name} as having left? They will no longer count as on duty.`) && act(() => updateDoctor(r.id, { isActive: false }))}>Mark as left</Button>
              </span>
            ) : <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => updateDoctor(r.id, { isActive: true }))}>Restore</Button> }] : []),
          ]} />
      </Panel>
    </div>
  );
}
