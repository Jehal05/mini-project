import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Field from '../../../components/Field.jsx';
import { useSave } from '../../profile/useProfile.jsx';
import { fmtTime, useLoad } from '../../shared/useLoad.js';
import { canManage } from '../HospitalLayout.jsx';
import { hospitalApi } from '../api.js';

/** Feature 84: admit a patient to a bed under a doctor (optionally linked to an emergency case); list current and past admissions. */
export default function AdmissionsPage() {
  const { role } = useOutletContext();
  const manage = canManage(role);
  const [view, setView] = useState('admitted');
  const list = useLoad(() => hospitalApi.admissions(view), [view]);
  const beds = useLoad(() => (manage ? hospitalApi.beds() : Promise.resolve({ beds: [] })), [manage]);
  const docs = useLoad(() => (manage ? hospitalApi.doctors() : Promise.resolve({ doctors: [] })), [manage]);
  const [f, setF] = useState({ patientId: '', bedId: '', doctorId: '', reason: '', caseId: '' });
  const save = useSave();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const vacant = beds.data?.beds.filter((b) => b.status === 'vacant' || b.status === 'reserved') ?? [];
  const doctors = docs.data?.doctors.filter((d) => d.isActive) ?? [];

  const submit = async (e) => {
    e.preventDefault();
    const body = { patientId: f.patientId, bedId: f.bedId, doctorId: f.doctorId, ...(f.reason && { reason: f.reason }), ...(f.caseId && { caseId: f.caseId }) };
    if (await save.run(() => hospitalApi.admit(body))) { setF({ patientId: '', bedId: '', doctorId: '', reason: '', caseId: '' }); list.reload(); beds.reload(); }
  };

  return (
    <div className="stack">
      {manage && (
        <section className="glass-card" aria-labelledby="admit-h">
          <h2 id="admit-h">Admit a patient</h2>
          <form onSubmit={submit} noValidate aria-label="Admit patient">
            <div className="grid-2">
              <Field label="Patient ID" value={f.patientId} onChange={set('patientId')} error={save.fields.patientId} hint="For example HT-2026-0001" />
              <Field label="Bed" error={save.fields.bedId}>{(id) => <select id={id} value={f.bedId} onChange={set('bedId')}><option value="">Choose a bed</option>{vacant.map((b) => <option key={b._id} value={b._id}>{b.label} ({b.type.toUpperCase()})</option>)}</select>}</Field>
              <Field label="Doctor" error={save.fields.doctorId}>{(id) => <select id={id} value={f.doctorId} onChange={set('doctorId')}><option value="">Choose a doctor</option>{doctors.map((d) => <option key={d._id} value={d._id}>{d.fullName} ({d.specialization})</option>)}</select>}</Field>
              <Field label="Reason (optional)" value={f.reason} onChange={set('reason')} error={save.fields.reason} />
            </div>
            {save.error && !Object.keys(save.fields).length && <p className="form-error" role="alert">{save.error}</p>}
            <button type="submit" className="btn btn-primary" disabled={save.busy}>{save.busy ? 'Admitting…' : 'Admit patient'}</button>
          </form>
        </section>
      )}
      <section className="glass-card" aria-labelledby="adm-list-h">
        <h2 id="adm-list-h">{view === 'admitted' ? 'Current patients' : 'Discharged patients'}</h2>
        <div className="tabs" role="group" aria-label="Show">
          <button type="button" className={`tab${view === 'admitted' ? ' active' : ''}`} aria-pressed={view === 'admitted'} onClick={() => setView('admitted')}>Admitted</button>
          <button type="button" className={`tab${view === 'discharged' ? ' active' : ''}`} aria-pressed={view === 'discharged'} onClick={() => setView('discharged')}>Discharged</button>
        </div>
        {list.error && <p className="form-error" role="alert">{list.error}</p>}
        <ul className="item-list">
          {list.data?.admissions.map((a) => (
            <li key={a._id}>
              <span><Link to={`/hospital/admissions/${a._id}`}><strong>{a.patientName}</strong></Link> <span className="mono hint">{a.patientId}</span> <span className="pill">{a.ward.toUpperCase()} {a.bedLabel}</span> <span className="hint">{a.doctorName}</span></span>
              <span className="hint">{fmtTime(a.admittedAt)}</span>
            </li>
          ))}
        </ul>
        {list.data?.admissions.length === 0 && <p className="hint">No patients here.</p>}
      </section>
    </div>
  );
}
