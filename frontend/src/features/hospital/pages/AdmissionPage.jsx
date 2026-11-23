import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import Field from '../../../components/Field.jsx';
import SevereAllergyBanner from '../../profile/SevereAllergyBanner.jsx';
import { useSave } from '../../profile/useProfile.jsx';
import { dischargeReport, patientReport } from '../../reports/pdf.js';
import { fmtTime, useLoad } from '../../shared/useLoad.js';
import { hospitalApi } from '../api.js';

const TABS = [['record', 'Patient record'], ['visits', 'Visit records'], ['rx', 'Prescriptions'], ['discharge', 'Discharge']];

/** Opening the record is an explicit step because the server logs every view of patient health data. */
function RecordTab({ id }) {
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState('');
  const [pdfErr, setPdfErr] = useState('');
  const open = async () => { setErr(''); try { setRec(await hospitalApi.record(id)); } catch (e) { setErr(e.message); } };
  const pdf = async () => { setPdfErr(''); try { (await patientReport(rec.patient, rec.summary?.text)).save(`patient-${rec.patient.patientId}.pdf`); } catch { setPdfErr('Could not create the PDF.'); } };
  if (!rec) {
    return (
      <div>
        <p className="hint">Opening the record is logged in the patient's access history.</p>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button type="button" className="btn btn-primary" onClick={open}>Open patient record</button>
      </div>
    );
  }
  const p = rec.patient;
  return (
    <div className="stack">
      <SevereAllergyBanner allergies={p.allergies} />
      {rec.summary && <section aria-labelledby="sum-h"><h3 id="sum-h">Health summary</h3><pre className="summary-text">{rec.summary.text}</pre></section>}
      <dl className="facts">
        <div><dt>Name</dt><dd>{p.fullName}</dd></div><div><dt>Age</dt><dd>{p.age ?? '—'}</dd></div><div><dt>Blood group</dt><dd>{p.bloodGroup ?? '—'}</dd></div>
      </dl>
      <h3>Allergies</h3>
      <ul>{p.allergies?.length ? p.allergies.map((a) => <li key={a._id ?? a.allergen}>{a.allergen} ({a.severity})</li>) : <li>None recorded</li>}</ul>
      <h3>Cardiac history</h3>
      <ul>{p.cardiacConditions?.length ? p.cardiacConditions.map((c) => <li key={c._id ?? c.type}>{String(c.type).replace('_', ' ')}{c.year ? ` (${c.year})` : ''}</li>) : <li>None recorded</li>}</ul>
      <h3>Medications</h3>
      <ul>{p.medications?.length ? p.medications.map((m) => <li key={m._id ?? m.drug}>{m.drug} {m.dose} {m.isBloodThinner && <span className="pill pill-red">Blood thinner</span>}</li>) : <li>None recorded</li>}</ul>
      {pdfErr && <p className="form-error" role="alert">{pdfErr}</p>}
      <button type="button" className="btn btn-secondary" onClick={pdf}>Download patient report (PDF)</button>
    </div>
  );
}

function VisitsTab({ id, open }) {
  const recs = useLoad(() => hospitalApi.records(id), [id]);
  const [kind, setKind] = useState('note');
  const [f, setF] = useState({ text: '', heartRate: '', systolic: '', diastolic: '', spo2: '', temperatureC: '' });
  const [file, setFile] = useState({ kind: 'ecg', title: '', file: null });
  const [preview, setPreview] = useState(null);
  const add = useSave();
  const up = useSave();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  const submit = async (e) => {
    e.preventDefault();
    const body = kind === 'note' ? { kind, text: f.text } : { kind, ...Object.fromEntries(['heartRate', 'systolic', 'diastolic', 'spo2', 'temperatureC'].filter((k) => f[k] !== '').map((k) => [k, Number(f[k])])) };
    if (await add.run(() => hospitalApi.addRecord(id, body))) { setF({ text: '', heartRate: '', systolic: '', diastolic: '', spo2: '', temperatureC: '' }); recs.reload(); }
  };
  const send = async (e) => {
    e.preventDefault();
    if (!file.file) return up.run(async () => { throw new Error('Choose a file'); });
    if (await up.run(() => hospitalApi.addRecordFile(id, file.file, file.kind, file.title))) { setFile({ kind: 'ecg', title: '', file: null }); e.target.reset(); recs.reload(); }
  };
  const view = async (r) => { const blob = await hospitalApi.recordFile(id, r._id); setPreview({ url: URL.createObjectURL(blob), type: blob.type, title: r.title ?? r.kind }); };

  return (
    <div className="stack">
      {open && (
        <>
          <form onSubmit={submit} noValidate aria-label="Add visit record">
            <Field label="Record type">{(fid) => <select id={fid} value={kind} onChange={(e) => setKind(e.target.value)}><option value="note">Clinical note</option><option value="vitals">In-hospital vitals</option></select>}</Field>
            {kind === 'note' ? (
              <Field label="Note" error={add.fields.text}>{(fid) => <textarea id={fid} rows={3} value={f.text} onChange={set('text')} />}</Field>
            ) : (
              <div className="grid-2">
                <Field label="Heart rate (bpm)" type="number" value={f.heartRate} onChange={set('heartRate')} error={add.fields.heartRate} />
                <Field label="SpO2 (%)" type="number" value={f.spo2} onChange={set('spo2')} error={add.fields.spo2} />
                <Field label="Systolic" type="number" value={f.systolic} onChange={set('systolic')} error={add.fields.systolic} />
                <Field label="Diastolic" type="number" value={f.diastolic} onChange={set('diastolic')} error={add.fields.diastolic} />
                <Field label="Temperature (°C)" type="number" step="0.1" value={f.temperatureC} onChange={set('temperatureC')} error={add.fields.temperatureC} />
              </div>
            )}
            {add.error && !Object.keys(add.fields).length && <p className="form-error" role="alert">{add.error}</p>}
            <button type="submit" className="btn btn-primary" disabled={add.busy}>Save record</button>
          </form>
          <form onSubmit={send} noValidate aria-label="Upload ECG or lab file">
            <h3>Upload ECG or lab file</h3>
            <Field label="File type">{(fid) => <select id={fid} value={file.kind} onChange={(e) => setFile((x) => ({ ...x, kind: e.target.value }))}><option value="ecg">ECG</option><option value="lab">Lab report</option></select>}</Field>
            <Field label="Title (optional)" value={file.title} onChange={(e) => setFile((x) => ({ ...x, title: e.target.value }))} />
            <Field label="File (PDF, PNG or JPG)" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile((x) => ({ ...x, file: e.target.files[0] ?? null }))} />
            {up.error && <p className="form-error" role="alert">{up.error}</p>}
            <button type="submit" className="btn btn-secondary" disabled={up.busy}>Upload</button>
          </form>
        </>
      )}
      {recs.error && <p className="form-error" role="alert">{recs.error}</p>}
      <ul className="item-list">
        {recs.data?.records.map((r) => (
          <li key={r._id}>
            <span>
              <strong>{{ note: 'Note', vitals: 'Vitals', ecg: 'ECG', lab: 'Lab report' }[r.kind]}</strong> <span className="hint">{fmtTime(r.createdAt)} · {r.authorName}</span><br />
              {r.kind === 'note' && r.text}
              {r.kind === 'vitals' && [r.heartRate != null && `HR ${r.heartRate}`, r.systolic != null && `BP ${r.systolic}/${r.diastolic}`, r.spo2 != null && `SpO2 ${r.spo2}%`, r.temperatureC != null && `${r.temperatureC}°C`].filter(Boolean).join(' · ')}
              {(r.kind === 'ecg' || r.kind === 'lab') && <button type="button" className="link-btn" onClick={() => view(r)}>View {r.title ?? r.originalName ?? 'file'}</button>}
            </span>
          </li>
        ))}
      </ul>
      {recs.data?.records.length === 0 && <p className="hint">No records yet.</p>}
      {preview && (
        <div className="preview" role="dialog" aria-label={`Preview ${preview.title}`}>
          {preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.title} /> : <iframe src={preview.url} title={preview.title} />}
          <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)}>Close preview</button>
        </div>
      )}
    </div>
  );
}

const blankRx = { drug: '', dose: '', frequency: '', duration: '' };

function RxTab({ id, open }) {
  const list = useLoad(() => hospitalApi.prescriptions(id), [id]);
  const [f, setF] = useState(blankRx);
  const [warn, setWarn] = useState(null); // allergens matched by the server
  const [live, setLive] = useState([]);
  const save = useSave();
  const set = (k) => (e) => { setWarn(null); setF((x) => ({ ...x, [k]: e.target.value })); };

  // Warn while typing the drug name, before the doctor has filled in anything else.
  useEffect(() => {
    if (f.drug.trim().length < 3) { setLive([]); return undefined; }
    let alive = true;
    const t = setTimeout(() => hospitalApi.checkDrug(id, f.drug.trim()).then((r) => alive && setLive(r.allergens)).catch(() => alive && setLive([])), 300);
    return () => { alive = false; clearTimeout(t); };
  }, [f.drug, id]);

  const submit = async (e, acknowledgeAllergy = false) => {
    e?.preventDefault();
    try {
      await hospitalApi.prescribe(id, { ...f, ...(acknowledgeAllergy && { acknowledgeAllergy: true }) });
      setF(blankRx); setWarn(null); setLive([]); list.reload();
    } catch (err) {
      if (err.code === 'ALLERGY_WARNING') setWarn({ message: err.message, allergens: err.details?.allergens ?? [] });
      else await save.run(async () => { throw err; });
    }
  };

  return (
    <div className="stack">
      {open && (
        <form onSubmit={submit} noValidate aria-label="Prescribe">
          <div className="grid-2">
            <Field label="Drug" value={f.drug} onChange={set('drug')} error={save.fields.drug} />
            <Field label="Dose" value={f.dose} onChange={set('dose')} error={save.fields.dose} />
            <Field label="Frequency" value={f.frequency} onChange={set('frequency')} error={save.fields.frequency} />
            <Field label="Duration" value={f.duration} onChange={set('duration')} error={save.fields.duration} />
          </div>
          {live.length > 0 && !warn && <p className="severe-banner" role="alert">⚠ Recorded allergy: {live.join(', ')}</p>}
          {warn && (
            <div className="severe-banner" role="alert">
              <strong>Allergy warning</strong>
              <p>{warn.message}</p>
              <button type="button" className="btn btn-danger" onClick={() => submit(null, true)}>Prescribe anyway</button>
              <button type="button" className="btn btn-secondary" onClick={() => setWarn(null)}>Cancel</button>
            </div>
          )}
          {save.error && !Object.keys(save.fields).length && <p className="form-error" role="alert">{save.error}</p>}
          {!warn && <button type="submit" className="btn btn-primary" disabled={save.busy}>Save prescription</button>}
        </form>
      )}
      {list.error && <p className="form-error" role="alert">{list.error}</p>}
      <ul className="item-list">
        {list.data?.prescriptions.map((p) => (
          <li key={p._id}>
            <span><strong>{p.drug}</strong> {p.dose}, {p.frequency}, {p.duration}{p.allergyOverride && <span className="pill pill-red">Allergy acknowledged</span>}<br /><span className="hint">{p.prescriberName} · {fmtTime(p.createdAt)}</span></span>
          </li>
        ))}
      </ul>
      {list.data?.prescriptions.length === 0 && <p className="hint">No prescriptions yet.</p>}
    </div>
  );
}

function DischargeTab({ id, role, onDone }) {
  const d = useLoad(() => hospitalApi.discharge(id), [id]);
  const [f, setF] = useState(null);
  const save = useSave();
  const [pdfErr, setPdfErr] = useState('');
  useEffect(() => { if (d.data && !d.data.finalized && !f) setF({ ...d.data.summary, medicines: d.data.summary.medicines ?? [] }); }, [d.data, f]);
  const doctor = role === 'doctor';
  const setMed = (i, k) => (e) => setF((x) => ({ ...x, medicines: x.medicines.map((m, j) => (j === i ? { ...m, [k]: e.target.value } : m)) }));
  const pdf = async (data) => { setPdfErr(''); try { (await dischargeReport(data)).save('discharge-summary.pdf'); } catch { setPdfErr('Could not create the PDF.'); } };

  if (d.error) return <p className="form-error" role="alert">{d.error}</p>;
  if (!d.data) return <p role="status">Loading…</p>;
  if (d.data.finalized) {
    const s = d.data.summary;
    return (
      <div className="stack">
        <p className="notice" role="status">Discharged. This summary is now in the patient's history.</p>
        <dl className="facts"><div><dt>Diagnosis</dt><dd>{s.diagnosis}</dd></div><div><dt>Treatment</dt><dd>{s.treatment}</dd></div><div><dt>Follow-up</dt><dd>{s.followUp || '—'}</dd></div></dl>
        <ul>{s.medicines.map((m, i) => <li key={i}>{m.drug} {m.dose}, {m.frequency}, {m.duration}</li>)}</ul>
        {pdfErr && <p className="form-error" role="alert">{pdfErr}</p>}
        <button type="button" className="btn btn-primary" onClick={() => pdf(d.data)}>Download discharge summary (PDF)</button>
      </div>
    );
  }
  if (!doctor) return <p className="hint">Only a doctor can discharge a patient.</p>;
  if (!f) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!window.confirm('Discharge this patient? This cannot be undone.')) return;
    const body = { diagnosis: f.diagnosis, treatment: f.treatment, followUp: f.followUp, medicines: f.medicines.filter((m) => m.drug) };
    if (await save.run(() => hospitalApi.finalize(id, body))) { d.reload(); onDone(); }
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Discharge summary">
      <Field label="Diagnosis" value={f.diagnosis} onChange={(e) => setF((x) => ({ ...x, diagnosis: e.target.value }))} error={save.fields.diagnosis} />
      <Field label="Treatment given" error={save.fields.treatment}>{(fid) => <textarea id={fid} rows={4} value={f.treatment} onChange={(e) => setF((x) => ({ ...x, treatment: e.target.value }))} />}</Field>
      <Field label="Follow-up" value={f.followUp ?? ''} onChange={(e) => setF((x) => ({ ...x, followUp: e.target.value }))} error={save.fields.followUp} />
      <h3>Discharge medicines</h3>
      {f.medicines.map((m, i) => (
        <div className="grid-2" key={i}>
          <Field label={`Drug ${i + 1}`} value={m.drug} onChange={setMed(i, 'drug')} />
          <Field label={`Dose ${i + 1}`} value={m.dose} onChange={setMed(i, 'dose')} />
          <Field label={`Frequency ${i + 1}`} value={m.frequency} onChange={setMed(i, 'frequency')} />
          <Field label={`Duration ${i + 1}`} value={m.duration} onChange={setMed(i, 'duration')} />
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => setF((x) => ({ ...x, medicines: [...x.medicines, { drug: '', dose: '', frequency: '', duration: '' }] }))}>Add medicine</button>
      {save.error && <p className="form-error" role="alert">{save.error}</p>}
      <button type="submit" className="btn btn-danger" disabled={save.busy}>{save.busy ? 'Saving…' : 'Finalize and discharge'}</button>
    </form>
  );
}

/** One admitted patient: record (84, 94), visit records (87), prescriptions (88) and discharge (89, 97). */
export default function AdmissionPage() {
  const { id } = useParams();
  const { role } = useOutletContext();
  const a = useLoad(() => hospitalApi.admission(id), [id]);
  const [tab, setTab] = useState('record');
  const adm = a.data?.admission;
  const open = adm?.status === 'admitted';
  const tabs = TABS.filter(([k]) => (k === 'record' || k === 'visits' ? role === 'doctor' || role === 'hospital_staff' : true));

  return (
    <div className="stack">
      <p><Link to="/hospital/admissions">← All patients</Link></p>
      {a.error && <p className="form-error" role="alert">{a.error}</p>}
      {adm && (
        <section className="glass-card" aria-labelledby="adm-h">
          <h2 id="adm-h">{adm.patientName} <span className="mono hint">{adm.patientId}</span></h2>
          <p>{adm.ward.toUpperCase()} · bed {adm.bedLabel} · {adm.doctorName} · {adm.status === 'admitted' ? `admitted ${fmtTime(adm.admittedAt)}` : `discharged ${fmtTime(adm.dischargedAt)}`}</p>
          <div className="tabs" role="tablist" aria-label="Patient sections">
            {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <div role="tabpanel">
            {tab === 'record' && <RecordTab id={id} />}
            {tab === 'visits' && <VisitsTab id={id} open={open} />}
            {tab === 'rx' && <RxTab id={id} open={open && role === 'doctor'} />}
            {tab === 'discharge' && <DischargeTab id={id} role={role} onDone={a.reload} />}
          </div>
        </section>
      )}
    </div>
  );
}
