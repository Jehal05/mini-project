import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Field from '../../../components/Field.jsx';
import { useSave } from '../../profile/useProfile.jsx';
import { useLoad } from '../../shared/useLoad.js';
import { hospitalApi } from '../api.js';

const blank = { fullName: '', specialization: '', phone: '', email: '', isCardiologist: false };

/** Feature 83: doctors, specializations and the on-duty roster. */
export default function DoctorsPage() {
  const { role } = useOutletContext();
  const isAdmin = role === 'hospital_admin';
  const docs = useLoad(() => hospitalApi.doctors(), []);
  const [f, setF] = useState(blank);
  const [notice, setNotice] = useState('');
  const add = useSave();
  const act = useSave();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const body = { fullName: f.fullName, specialization: f.specialization, isCardiologist: f.isCardiologist, ...(f.phone && { phone: f.phone }), ...(f.email && { email: f.email }) };
    const res = await add.run(() => hospitalApi.addDoctor(body));
    if (res) { setF(blank); setNotice(res.invite === 'sent' ? `Added ${res.doctor.fullName}. A link to choose a password was emailed.` : res.invite === 'failed' ? `Added ${res.doctor.fullName}, but the invite email failed. They can use "Forgot password".` : `Added ${res.doctor.fullName} (no login).`); docs.reload(); }
  };
  const change = async (d, body) => { if (await act.run(() => hospitalApi.updateDoctor(d._id, body))) docs.reload(); };

  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="docs-h">
        <h2 id="docs-h">Doctors</h2>
        <p className="hint">"Cardiologist on duty" is used to rank this hospital for emergencies and to assign doctors.</p>
        {notice && <p className="notice" role="status">{notice}</p>}
        {docs.error && <p className="form-error" role="alert">{docs.error}</p>}
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        <ul className="item-list">
          {docs.data?.doctors.map((d) => (
            <li key={d._id}>
              <span>
                <strong>{d.fullName}</strong> <span className="hint">{d.specialization}</span>
                {d.isCardiologist && <span className="pill">Cardiologist</span>} {d.onDuty && <span className="pill pill-vacant">On duty</span>} {!d.isActive && <span className="pill pill-red">Inactive</span>}
              </span>
              {isAdmin && d.isActive && (
                <span className="item-actions">
                  <label className="check"><input type="checkbox" checked={d.onDuty} onChange={(e) => change(d, { onDuty: e.target.checked })} /> On duty<span className="sr-only"> {d.fullName}</span></label>
                  <button type="button" className="link-btn danger" onClick={() => window.confirm(`Deactivate ${d.fullName}? Their login stops working.`) && change(d, { isActive: false })} aria-label={`Deactivate ${d.fullName}`}>Deactivate</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {isAdmin && (
        <section className="glass-card" aria-labelledby="add-doc-h">
          <h2 id="add-doc-h">Add a doctor</h2>
          <form onSubmit={submit} noValidate aria-label="Add doctor">
            <div className="grid-2">
              <Field label="Full name" value={f.fullName} onChange={set('fullName')} error={add.fields.fullName} />
              <Field label="Specialization" value={f.specialization} onChange={set('specialization')} error={add.fields.specialization} />
              <Field label="Phone (optional)" type="tel" value={f.phone} onChange={set('phone')} error={add.fields.phone} />
              <Field label="Login email (optional)" type="email" value={f.email} onChange={set('email')} error={add.fields.email} hint="With an email, they get a link to choose a password" />
            </div>
            <label className="check"><input type="checkbox" checked={f.isCardiologist} onChange={set('isCardiologist')} /> Cardiologist</label>
            {add.error && !Object.keys(add.fields).length && <p className="form-error" role="alert">{add.error}</p>}
            <button type="submit" className="btn btn-primary" disabled={add.busy}>{add.busy ? 'Adding…' : 'Add doctor'}</button>
          </form>
        </section>
      )}
    </div>
  );
}
