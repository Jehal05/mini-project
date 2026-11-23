import { useState } from 'react';
import Button from '../ui/Button.jsx';
import { Badge, Card, Panel } from '../ui/Surface.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { EmptyState, ErrorState } from '../ui/Feedback.jsx';
import { fetchFullRecord, openFullDocument } from '../lib/passportApi.js';
import { SECTIONS, SECTION_ORDER, docTypeLabel, formatBytes, passportTokenFrom, phoneForDisplay } from '../lib/patientRecord.js';

// Feature 20, hospital side: paste a scanned passport link to open the full record. Every view is logged on the server.
export default function PassportLookup() {
  const [text, setText] = useState('');
  const [record, setRecord] = useState(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function open(e) {
    e.preventDefault();
    const t = passportTokenFrom(text);
    if (!t) { setError('That does not look like a passport link. Paste the whole link from the QR code.'); return; }
    setBusy(true); setError(''); setRecord(null);
    try { setRecord(await fetchFullRecord(t)); setToken(t); }
    catch (err) { setError(err.status === 401 || err.status === 403 ? 'Sign in with a hospital account to open full records.' : err.message); }
    finally { setBusy(false); }
  }
  async function doc(d) {
    try { const url = await openFullDocument(token, d.id); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (err) { setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <form onSubmit={open} className="flex flex-wrap items-end gap-3" noValidate>
          <div className="min-w-[16rem] flex-1"><Field label="Passport link" hint="Opening a record is logged with your name and hospital">{(p) => <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="http://…/p/…" {...p} />}</Field></div>
          <Button type="submit" busy={busy} disabled={!text.trim()}>Open full record</Button>
        </form>
      </Card>
      {error && <ErrorState title="Could not open the record">{error}</ErrorState>}
      {!record && !error && <Card><EmptyState icon="user" title="No record open">Scan the patient's QR code and paste the link above.</EmptyState></Card>}
      {record && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={record.fullName}>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Patient ID</dt><dd>{record.patientId}</dd>
              <dt className="text-muted">Age</dt><dd>{record.age ?? 'Not set'}</dd>
              <dt className="text-muted">Gender</dt><dd>{record.gender?.replace(/_/g, ' ') ?? 'Not set'}</dd>
              <dt className="text-muted">Blood group</dt><dd>{record.bloodGroup ? <Badge tone="critical">{record.bloodGroup}</Badge> : 'Not set'}</dd>
              <dt className="text-muted">Address</dt><dd>{[record.address, record.city].filter(Boolean).join(', ') || 'Not set'}</dd>
            </dl>
            <h3 className="mb-1 mt-4 font-semibold">Emergency contacts</h3>
            <ol className="space-y-1 text-sm">{record.emergencyContacts.map((c) => <li key={c.id}>{c.priority}. {c.name} ({c.relation}) <a className="font-semibold text-accent underline" href={`tel:${c.phone}`}>{phoneForDisplay(c.phone)}</a></li>)}</ol>
            <h3 className="mb-1 mt-4 font-semibold">Documents</h3>
            {record.documents.length ? <ul className="space-y-1 text-sm">{record.documents.map((d) => <li key={d.id} className="flex items-center gap-2"><span className="flex-1 truncate">{d.originalName} <span className="text-muted">({docTypeLabel(d.type)}, {formatBytes(d.size)})</span></span><Button size="sm" variant="secondary" onClick={() => doc(d)}>View</Button></li>)}</ul> : <p className="text-sm text-muted">None uploaded</p>}
          </Panel>
          <div className="space-y-4">
            {SECTION_ORDER.map((s) => (
              <Panel key={s} title={SECTIONS[s].label}>
                {record[s]?.length ? <ul className="space-y-1 text-sm">{record[s].map((it) => { const b = SECTIONS[s].badge?.(it); return <li key={it.id}><span className="font-semibold">{SECTIONS[s].title(it)}</span> {b && <Badge tone={b.tone}>{b.text}</Badge>} <span className="text-muted">{SECTIONS[s].detail(it)}</span></li>; })}</ul> : <p className="text-sm text-muted">None recorded</p>}
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
