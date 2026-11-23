import { useEffect, useState } from 'react';
import { fetchProfile, saveProfile } from '../lib/hospitalApi.js';
import Button from '../ui/Button.jsx';
import { Panel, Badge } from '../ui/Surface.jsx';
import { Field, Input, Checkbox } from '../ui/Form.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';

// Feature 81: the hospital's profile. Name and location are set by the central admin; the hospital admin keeps the phone number and cath lab up to date.
export default function Profile({ canEdit }) {
  const [h, setH] = useState(null);
  const [form, setForm] = useState({ phone: '', cathLab: false });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => fetchProfile().then((x) => { setH(x); setForm({ phone: x.phone, cathLab: x.capabilities.cathLab }); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault(); setBusy(true); setFields({}); setSaved(false);
    try { const x = await saveProfile({ phone: form.phone, cathLab: form.cathLab }); setH(x); setSaved(true); } catch (err) { setFields(err.fields ?? {}); if (!Object.keys(err.fields ?? {}).length) setError(err.message); } finally { setBusy(false); }
  }

  if (error && !h) return <ErrorState onRetry={load}>{error}</ErrorState>;
  if (!h) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <Panel title={h.name}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Code</dt><dd>{h.code}</dd></div>
          <div><dt className="text-muted">Area</dt><dd>{h.area || '–'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted">Address</dt><dd>{h.address || '–'}</dd></div>
          <div><dt className="text-muted">Cardiologist on duty</dt><dd>{h.capabilities.cardiologistOnDuty ? <Badge tone="low" icon="check">Yes</Badge> : <Badge>No</Badge>} <span className="text-xs text-muted">Follows the doctors list</span></dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">To change the name or location, ask the central admin.</p>
      </Panel>
      <Panel title="Contact and facilities">
        <form onSubmit={save} className="flex flex-wrap items-start gap-3">
          <Field label="Phone" error={fields.phone}>{(p) => <Input {...p} inputMode="tel" disabled={!canEdit} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <div className="mt-6"><Checkbox label="Has a cath lab" disabled={!canEdit} checked={form.cathLab} onChange={(e) => setForm({ ...form, cathLab: e.target.checked })} /></div>
          {canEdit && <Button type="submit" busy={busy} className="mt-6" icon="check">Save changes</Button>}
        </form>
        {saved && <p role="status" className="mt-2 text-sm text-low">Saved</p>}
        {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
        {!canEdit && <p className="mt-2 text-xs text-muted">Only a hospital admin can change these.</p>}
      </Panel>
    </div>
  );
}
