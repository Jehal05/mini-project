import { useCallback, useEffect, useState } from 'react';
import { addRecord, addRecordFile, recordFileUrl, checkAllergy, fetchAdmission, fetchDischarge, fetchPrescriptions, fetchRecords, finalizeDischarge, prescribe } from '../lib/inpatientApi.js';
import { readAsBase64 } from '../lib/patientApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { Badge } from '../ui/Surface.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import Icon from '../ui/icons.jsx';

const when = (d) => (d ? new Date(d).toLocaleString() : '');

// One stay: notes and vitals (87), prescriptions with an allergy warning (88, doctors only), and discharge (89, doctors only).
export default function AdmissionDetail({ id, role, onBack }) {
  const [adm, setAdm] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { fetchAdmission(id).then((a) => { setAdm(a); setError(''); }).catch((e) => setError(e.message)); }, [id, tick]);
  const isDoctor = role === 'doctor';
  const open = adm?.status === 'admitted';

  if (error) return <div className="space-y-3"><Button variant="secondary" onClick={onBack}>Back</Button><ErrorState onRetry={refresh}>{error}</ErrorState></div>;
  if (!adm) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <Button variant="secondary" onClick={onBack}>Back to patients</Button>
      <Panel>
        <h2 className="font-title text-2xl font-semibold">{adm.patientName || adm.patientId}</h2>
        <p className="mt-1 text-sm text-muted">{adm.patientId}{adm.bloodGroup ? `, blood group ${adm.bloodGroup}` : ''}. {adm.ward ? `${adm.ward} ward.` : 'No bed yet.'} {adm.doctorName ? `Doctor: ${adm.doctorName}.` : ''}</p>
        <p className="mt-1 text-sm">{adm.reason}</p>
        <div className="mt-2"><Badge tone={open ? 'info' : 'neutral'} icon={open ? 'info' : 'check'}>{open ? 'In hospital' : `Discharged ${when(adm.dischargedAt)}`}</Badge></div>
      </Panel>
      <Notes id={id} open={open} />
      <Prescriptions id={id} open={open} isDoctor={isDoctor} onChange={refresh} />
      <Discharge id={id} open={open} isDoctor={isDoctor} onDone={refresh} />
    </div>
  );
}

function Notes({ id, open }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [v, setV] = useState({ heartRate: '', systolic: '', diastolic: '', spo2: '', temperatureC: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetchRecords(id).then(setList).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  async function send(body, reset) { setBusy(true); setError(''); try { await addRecord(id, body); reset(); await load(); } catch (e) { setError(Object.values(e.fields ?? {})[0] || e.message); } finally { setBusy(false); } }
  const [fileForm, setFileForm] = useState({ kind: 'ecg', title: '', file: null });
  async function sendFile(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const f = fileForm.file;
      await addRecordFile(id, { kind: fileForm.kind, title: fileForm.title || undefined, name: f.name, data: await readAsBase64(f) });
      setFileForm({ kind: fileForm.kind, title: '', file: null }); e.target.reset(); await load();
    } catch (err) { setError(Object.values(err.fields ?? {})[0] || err.message); } finally { setBusy(false); }
  }
  async function openFile(recordId) {
    try { const url = await recordFileUrl(id, recordId); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (err) { setError(err.message); }
  }
  const numbers = () => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
  return (
    <Panel title="Notes and vitals">
      {open && (
        <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); send({ kind: 'note', text }, () => setText('')); }} className="space-y-2">
            <Field label="Add a note">{(p) => <textarea {...p} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} className="w-full rounded-ui border border-line bg-surface p-2 text-ink" />}</Field>
            <Button type="submit" size="sm" busy={busy} disabled={!text.trim()}>Save note</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); send({ kind: 'vitals', ...numbers() }, () => setV({ heartRate: '', systolic: '', diastolic: '', spo2: '', temperatureC: '' })); }} className="space-y-2">
            <p className="text-sm font-semibold">Record vitals</p>
            <div className="grid grid-cols-2 gap-2">
              {[['heartRate', 'Heart rate (bpm)'], ['spo2', 'SpO₂ (%)'], ['systolic', 'Systolic'], ['diastolic', 'Diastolic'], ['temperatureC', 'Temp (°C)']].map(([k, l]) => (
                <Field key={k} label={l}>{(p) => <Input {...p} type="number" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}</Field>
              ))}
            </div>
            <Button type="submit" size="sm" busy={busy} disabled={!Object.keys(numbers()).length}>Save vitals</Button>
          </form>
        </div>
      )}
      {open && (
        <form onSubmit={sendFile} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Field label="Report type">{(p) => <select {...p} value={fileForm.kind} onChange={(e) => setFileForm({ ...fileForm, kind: e.target.value })} className="min-h-touch rounded-ui border border-line bg-surface px-2 text-ink"><option value="ecg">ECG</option><option value="lab">Lab report</option></select>}</Field>
          <Field label="Title" hint="Optional">{(p) => <Input {...p} value={fileForm.title} maxLength={120} onChange={(e) => setFileForm({ ...fileForm, title: e.target.value })} />}</Field>
          <Field label="File" hint="PDF, JPEG or PNG">{(p) => <input {...p} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFileForm({ ...fileForm, file: e.target.files?.[0] ?? null })} />}</Field>
          <Button type="submit" size="sm" busy={busy} disabled={!fileForm.file}>Upload report</Button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-critical">{error}</p>}
      <ul className="mt-4 space-y-2" aria-label="Entries">
        {(list ?? []).map((r) => (
          <li key={r.id} className="rounded-ui border border-line p-2 text-sm">
            <p className="text-xs text-muted">{when(r.at)}{r.authorName ? `, ${r.authorName}` : ''}</p>
            {r.file ? <p><Button size="sm" variant="secondary" onClick={() => openFile(r.id)}>Open {r.kind === 'ecg' ? 'ECG' : 'lab report'}</Button> <span className="ml-1">{r.title || r.file.name}</span></p> : r.kind === 'note' ? <p className="whitespace-pre-wrap">{r.text}</p> : <p className="tnum">Vitals: {Object.entries(r.vitals ?? {}).map(([k, x]) => `${k} ${x}`).join(', ')}</p>}
          </li>
        ))}
        {list && !list.length && <li className="text-sm text-muted">No entries yet.</li>}
      </ul>
      <p className="mt-2 text-xs text-muted">Opening this list is logged. Ranges and readings here are demo data, not clinical advice.</p>
    </Panel>
  );
}

function Prescriptions({ id, open, isDoctor, onChange }) {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ drug: '', dose: '', frequency: '', duration: '' });
  const [warn, setWarn] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetchPrescriptions(id).then(setList).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  // Warn as the doctor types the drug name, before anything is saved.
  useEffect(() => {
    if (!isDoctor || !open || f.drug.trim().length < 3) { setWarn([]); return undefined; }
    const t = setTimeout(() => checkAllergy(id, f.drug).then(setWarn).catch(() => setWarn([])), 400);
    return () => clearTimeout(t);
  }, [f.drug, id, isDoctor, open]);

  async function save(acknowledgeAllergy) {
    setBusy(true); setError('');
    try { await prescribe(id, { ...f, ...(acknowledgeAllergy ? { acknowledgeAllergy: true } : {}) }); setF({ drug: '', dose: '', frequency: '', duration: '' }); setWarn([]); await load(); onChange(); } catch (e) { setError(e.code === 'ALLERGY_WARNING' ? '' : Object.values(e.fields ?? {})[0] || e.message); if (e.allergens) setWarn(e.allergens); } finally { setBusy(false); }
  }
  return (
    <Panel title="Prescriptions">
      {isDoctor && open && (
        <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="grid gap-3 sm:grid-cols-2">
          <Field label="Drug">{(p) => <Input {...p} value={f.drug} onChange={(e) => setF({ ...f, drug: e.target.value })} maxLength={120} required />}</Field>
          <Field label="Dose">{(p) => <Input {...p} value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} maxLength={60} required />}</Field>
          <Field label="How often">{(p) => <Input {...p} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })} maxLength={60} required />}</Field>
          <Field label="For how long">{(p) => <Input {...p} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} maxLength={60} required />}</Field>
          {warn.length > 0 && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-ui border border-critical bg-critical-soft p-3 text-sm sm:col-span-2">
              <span className="flex items-center gap-2 font-semibold text-critical"><Icon name="octagon-alert" size={18} />Allergy warning: this patient has a recorded allergy to {warn.join(', ')}.</span>
              <Button type="button" variant="danger" size="sm" busy={busy} onClick={() => save(true)}>Prescribe anyway</Button>
            </div>
          )}
          <div className="sm:col-span-2"><Button type="submit" busy={busy} disabled={warn.length > 0}>Prescribe</Button>{error && <p role="alert" className="mt-2 text-sm font-semibold text-critical">{error}</p>}</div>
        </form>
      )}
      {!isDoctor && open && <p className="text-sm text-muted">Only doctors can prescribe.</p>}
      <ul className="mt-4 space-y-2" aria-label="Prescriptions">
        {(list ?? []).map((p) => (
          <li key={p.id} className="rounded-ui border border-line p-2 text-sm">
            <p className="font-semibold">{p.drug} <span className="font-normal">{p.dose}, {p.frequency}, {p.duration}</span></p>
            <p className="text-xs text-muted">{when(p.at)}{p.prescriberName ? `, ${p.prescriberName}` : ''}</p>
            {p.allergyOverride && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-critical"><Icon name="octagon-alert" size={14} />Allergy warning confirmed: {p.allergyOverride.join(', ')}</p>}
          </li>
        ))}
        {list && !list.length && <li className="text-sm text-muted">No prescriptions yet.</li>}
      </ul>
    </Panel>
  );
}

function Discharge({ id, open, isDoctor, onDone }) {
  const [state, setState] = useState(null);
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { fetchDischarge(id).then((d) => { setState(d); setF(d.summary); }).catch((e) => setError(e.message)); }, [id]);
  async function finish() {
    setBusy(true); setError('');
    try { const out = await finalizeDischarge(id, { diagnosis: f.diagnosis, treatment: f.treatment, followUp: f.followUp || undefined, medicines: f.medicines }); setState(out); setConfirm(false); onDone(); } catch (e) { setError(Object.values(e.fields ?? {})[0] || e.message); setConfirm(false); } finally { setBusy(false); }
  }
  if (!state && !error) return null;
  return (
    <Panel title="Discharge summary">
      {error && <p role="alert" className="mb-2 text-sm font-semibold text-critical">{error}</p>}
      {state?.finalized && (
        <dl className="space-y-2 text-sm">
          <div><dt className="font-semibold text-muted">Diagnosis</dt><dd>{state.summary.diagnosis}</dd></div>
          <div><dt className="font-semibold text-muted">Treatment</dt><dd className="whitespace-pre-wrap">{state.summary.treatment}</dd></div>
          <div><dt className="font-semibold text-muted">Medicines</dt><dd>{state.summary.medicines.length ? state.summary.medicines.map((m) => `${m.drug} ${m.dose ?? ''} ${m.frequency ?? ''} ${m.duration ?? ''}`.trim()).join('; ') : 'None'}</dd></div>
          {state.summary.followUp && <div><dt className="font-semibold text-muted">Follow-up</dt><dd>{state.summary.followUp}</dd></div>}
          <p className="text-xs text-muted">Finalized {when(state.summary.finalizedAt)}{state.summary.finalizedByName ? ` by ${state.summary.finalizedByName}` : ''}. It cannot be changed, and it now appears in the patient's history.</p>
        </dl>
      )}
      {state && !state.finalized && f && (isDoctor && open ? (
        <form onSubmit={(e) => { e.preventDefault(); setConfirm(true); }} className="space-y-3">
          <Field label="Diagnosis">{(p) => <Input {...p} value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} maxLength={500} required />}</Field>
          <Field label="Treatment given">{(p) => <textarea {...p} value={f.treatment} onChange={(e) => setF({ ...f, treatment: e.target.value })} rows={3} maxLength={2000} required className="w-full rounded-ui border border-line bg-surface p-2 text-ink" />}</Field>
          <Field label="Follow-up">{(p) => <Input {...p} value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })} maxLength={500} />}</Field>
          <p className="text-sm text-muted">Medicines to take home: {f.medicines.length ? f.medicines.map((m) => m.drug).join(', ') : 'none prescribed'} (from the prescriptions above).</p>
          {!confirm ? <Button type="submit" icon="check">Review and discharge</Button> : (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-ui border border-line p-3 text-sm">
              <span>Discharge this patient? The summary cannot be changed afterwards.</span>
              <Button type="button" variant="danger" busy={busy} onClick={finish}>Discharge</Button>
              <Button type="button" variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            </div>
          )}
        </form>
      ) : <p className="text-sm text-muted">{open ? 'Only a doctor can discharge a patient.' : 'No summary was written.'}</p>)}
    </Panel>
  );
}
