import { useState } from 'react';
import Field from '../../components/Field.jsx';
import { useSave } from '../profile/useProfile.jsx';
import { adminApi } from '../hospital/api.js';
import { useLoad } from '../shared/useLoad.js';

const blank = { name: '', address: '', phone: '', latitude: '', longitude: '', cathLab: false, cardiologist24x7: false, icuBeds: '0', ccuBeds: '0', alsAmbulances: '0', adminName: '', adminEmail: '' };

const toForm = (h) => ({
  name: h.name, address: h.address ?? '', phone: h.phone ?? '', latitude: String(h.location.latitude), longitude: String(h.location.longitude),
  cathLab: Boolean(h.capabilities?.cathLab), cardiologist24x7: Boolean(h.capabilities?.cardiologist24x7),
  icuBeds: String(h.capabilities?.icuBeds ?? 0), ccuBeds: String(h.capabilities?.ccuBeds ?? 0), alsAmbulances: String(h.capabilities?.alsAmbulances ?? 0), adminName: '', adminEmail: '',
});

function toBody(f, withAdmin) {
  const n = (v) => (v === '' ? undefined : Number(v));
  const body = {
    name: f.name.trim(), address: f.address.trim(), ...(f.phone.trim() && { phone: f.phone.trim() }),
    location: { latitude: Number(f.latitude), longitude: Number(f.longitude) },
    capabilities: { cathLab: f.cathLab, cardiologist24x7: f.cardiologist24x7, icuBeds: n(f.icuBeds), ccuBeds: n(f.ccuBeds), alsAmbulances: n(f.alsAmbulances) },
  };
  if (withAdmin) body.admin = { name: f.adminName.trim(), email: f.adminEmail.trim() };
  return body;
}

/** Errors from the server use dotted paths (location.latitude); the form fields are flat. */
const fieldErrors = (d = {}) => ({
  ...d, latitude: d['location.latitude'] ?? d.location, longitude: d['location.longitude'],
  icuBeds: d['capabilities.icuBeds'], ccuBeds: d['capabilities.ccuBeds'], alsAmbulances: d['capabilities.alsAmbulances'],
  adminName: d['admin.name'], adminEmail: d['admin.email'],
});

function HospitalForm({ initial, withAdmin, submitLabel, onSubmit, onCancel, label }) {
  const [f, setF] = useState(initial);
  const save = useSave();
  const e = fieldErrors(save.fields);
  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value }));
  const submit = async (ev) => {
    ev.preventDefault();
    const res = await save.run(() => onSubmit(toBody(f, withAdmin)));
    if (res && withAdmin) setF(blank);
    return res;
  };
  return (
    <form onSubmit={submit} noValidate aria-label={label}>
      <div className="grid-2">
        <Field label="Hospital name" value={f.name} onChange={set('name')} error={e.name} />
        <Field label="Phone" value={f.phone} onChange={set('phone')} error={e.phone} hint="A mobile or a landline with its STD code" />
        <Field label="Address" value={f.address} onChange={set('address')} error={e.address} />
        <span />
        <Field label="Latitude" inputMode="decimal" value={f.latitude} onChange={set('latitude')} error={e.latitude} hint="For example 18.5308" />
        <Field label="Longitude" inputMode="decimal" value={f.longitude} onChange={set('longitude')} error={e.longitude} hint="For example 73.8474" />
        <Field label="ICU beds" type="number" min="0" value={f.icuBeds} onChange={set('icuBeds')} error={e.icuBeds} />
        <Field label="CCU beds" type="number" min="0" value={f.ccuBeds} onChange={set('ccuBeds')} error={e.ccuBeds} />
        <Field label="ALS ambulances" type="number" min="0" value={f.alsAmbulances} onChange={set('alsAmbulances')} error={e.alsAmbulances} />
        <div>
          <label className="check"><input type="checkbox" checked={f.cathLab} onChange={set('cathLab')} /> Cath lab</label>
          <label className="check"><input type="checkbox" checked={f.cardiologist24x7} onChange={set('cardiologist24x7')} /> Cardiologist 24x7</label>
        </div>
        {withAdmin && (
          <>
            <Field label="Hospital admin name" value={f.adminName} onChange={set('adminName')} error={e.adminName} />
            <Field label="Hospital admin email" type="email" value={f.adminEmail} onChange={set('adminEmail')} error={e.adminEmail} hint="They get a link to choose their password" />
          </>
        )}
      </div>
      {save.error && <p className="form-error" role="alert">{save.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : submitLabel}</button>
      {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

/** Feature 81: central admin registers hospitals (name, address, map point, phone, capabilities) and their admin account. */
export default function HospitalsPage() {
  const list = useLoad(() => adminApi.hospitals(), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const toggle = useSave();

  const create = async (body) => {
    const res = await adminApi.createHospital(body);
    setNotice(res.invite === 'sent' ? `Registered ${res.hospital.name}. A link to choose a password was emailed to ${res.admin.email}.` : `Registered ${res.hospital.name}. The invite email could not be sent to ${res.admin.email}; the admin can use "Forgot password".`);
    setAdding(false);
    list.reload();
    return res;
  };
  const update = (id) => async (body) => {
    const { admin: _ignored, ...rest } = body;
    const res = await adminApi.updateHospital(id, rest);
    setEditing(null);
    list.reload();
    return res;
  };
  const setActive = async (h, isActive) => {
    if (!isActive && !window.confirm(`Close ${h.name}? All of its staff accounts will be switched off.`)) return;
    if (await toggle.run(() => adminApi.updateHospital(h._id, { isActive }))) list.reload();
  };

  return (
    <section className="glass-card" aria-labelledby="hosp-h">
      <div className="row-between">
        <h2 id="hosp-h">Hospitals</h2>
        {!adding && <button type="button" className="btn btn-primary" onClick={() => { setAdding(true); setNotice(''); }}>Register a hospital</button>}
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {adding && <HospitalForm label="Register hospital" initial={blank} withAdmin submitLabel="Register hospital" onSubmit={create} onCancel={() => setAdding(false)} />}
      {list.error && <p className="form-error" role="alert">{list.error}</p>}
      {toggle.error && <p className="form-error" role="alert">{toggle.error}</p>}
      {list.loading && !list.data && <p role="status">Loading…</p>}
      <ul className="item-list">
        {list.data?.hospitals.map((h) => (
          <li key={h._id} className="contact">
            <div className="row-between">
              <span>
                <strong>{h.name}</strong> {!h.isActive && <span className="pill pill-red">Closed</span>}
                <div className="hint">{h.address} · {h.phone ?? 'no phone'} · {h.location.latitude.toFixed(4)}, {h.location.longitude.toFixed(4)}</div>
                <div className="hint">
                  {h.capabilities.cathLab ? 'Cath lab · ' : ''}{h.capabilities.cardiologist24x7 ? 'Cardiologist 24x7 · ' : ''}ICU {h.capabilities.icuBeds} · CCU {h.capabilities.ccuBeds} · ALS ambulances {h.capabilities.alsAmbulances} · {h.beds} beds free
                </div>
              </span>
              <span className="item-actions">
                <button type="button" className="link-btn" onClick={() => setEditing(editing === h._id ? null : h._id)} aria-label={`Edit ${h.name}`}>Edit</button>
                {h.isActive
                  ? <button type="button" className="link-btn danger" onClick={() => setActive(h, false)} aria-label={`Close ${h.name}`}>Close</button>
                  : <button type="button" className="link-btn" onClick={() => setActive(h, true)} aria-label={`Reopen ${h.name}`}>Reopen</button>}
              </span>
            </div>
            {editing === h._id && <HospitalForm label={`Edit ${h.name}`} initial={toForm(h)} submitLabel="Save changes" onSubmit={update(h._id)} onCancel={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
