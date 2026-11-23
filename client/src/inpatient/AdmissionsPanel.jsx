import { useCallback, useEffect, useState } from 'react';
import { admitPatient, fetchAdmissions, fetchBeds, fetchDoctors } from '../lib/inpatientApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input, Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { Tabs } from '../ui/Data.jsx';

// Feature 84: who is in the hospital, and (for staff) admit a patient to a free bed under a doctor.
export default function AdmissionsPanel({ canAdmit, onOpen }) {
  const [status, setStatus] = useState('admitted');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => fetchAdmissions(status).then((r) => { setRows(r); setError(''); }).catch((e) => setError(e.message)), [status]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <div className="space-y-4">
      {canAdmit && <AdmitForm onDone={() => { setStatus('admitted'); load(); }} />}
      <Tabs label="Patients" value={status} onChange={setStatus} tabs={[{ id: 'admitted', label: 'In hospital' }, { id: 'discharged', label: 'Discharged' }]} />
      {error && <ErrorState onRetry={load}>{error}</ErrorState>}
      {!rows && !error && <Skeleton className="h-24" />}
      {rows && rows.length === 0 && <EmptyState icon="inbox" title={status === 'admitted' ? 'No patients admitted' : 'No discharges yet'}>{status === 'admitted' ? 'Admitted patients show here.' : 'Discharged stays show here.'}</EmptyState>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2" aria-label="Patients">
          {rows.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)} className="glass flex min-h-touch w-full flex-wrap items-center justify-between gap-2 rounded-ui border border-line p-3 text-left hover:border-accent">
                <span><span className="block font-semibold">{a.patientName || a.patientId}</span><span className="text-xs text-muted">{a.patientId}{a.bloodGroup ? `, ${a.bloodGroup}` : ''}</span></span>
                <span className="text-sm text-muted">{a.ward ? `${a.ward}, ` : 'No bed yet, '}{a.doctorName ? `Dr ${a.doctorName.replace(/^Dr\.? /, '')}` : 'no doctor yet'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdmitForm({ onDone }) {
  const [beds, setBeds] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [f, setF] = useState({ patientId: '', bedId: '', doctorId: '', reason: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetchBeds().then((d) => setBeds(d.beds.filter((b) => b.status === 'free' || b.status === 'reserved'))).catch(() => {}); fetchDoctors().then(setDoctors).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setFields({}); setError('');
    try { await admitPatient({ ...f, patientId: f.patientId.trim(), reason: f.reason || undefined }); setF({ patientId: '', bedId: '', doctorId: '', reason: '' }); load(); onDone(); } catch (err) { setFields(err.fields ?? {}); if (!err.fields || !Object.keys(err.fields).length) setError(err.message); load(); } finally { setBusy(false); }
  }
  return (
    <Panel title="Admit a patient">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Patient ID" hint="For example HT-2026-0001" error={fields.patientId}>{(p) => <Input {...p} value={f.patientId} onChange={(e) => setF({ ...f, patientId: e.target.value })} required />}</Field>
        <Field label="Reason" error={fields.reason}>{(p) => <Input {...p} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} />}</Field>
        <Field label="Bed" error={fields.bedId}>{(p) => <Select {...p} value={f.bedId} onChange={(e) => setF({ ...f, bedId: e.target.value })} required><option value="">Choose a free bed</option>{beds.map((b) => <option key={b.id} value={b.id}>{b.label} ({b.ward})</option>)}</Select>}</Field>
        <Field label="Doctor" error={fields.doctorId}>{(p) => <Select {...p} value={f.doctorId} onChange={(e) => setF({ ...f, doctorId: e.target.value })} required><option value="">Choose a doctor</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}</Field>
        <div className="sm:col-span-2"><Button type="submit" busy={busy} icon="check">Admit patient</Button>{error && <p role="alert" className="mt-2 text-sm font-semibold text-critical">{error}</p>}</div>
      </form>
    </Panel>
  );
}
