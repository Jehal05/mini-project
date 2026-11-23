import { useEffect, useRef, useState } from 'react';
import Field from '../../../components/Field.jsx';
import { profileApi } from '../api.js';
import { BLOOD_GROUPS } from '../constants.js';
import { useProfile, useSave } from '../useProfile.jsx';

const toForm = (p) => ({
  fullName: p.fullName ?? '',
  dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
  gender: p.gender ?? '',
  bloodGroup: p.bloodGroup ?? '',
  address: p.address ?? '',
  city: p.city ?? '',
});

function Photo() {
  const { patient, apply } = useProfile();
  const save = useSave();
  const [src, setSrc] = useState('');
  const input = useRef(null);

  useEffect(() => {
    let url = '';
    let live = true;
    if (patient.hasPhoto) {
      profileApi.photoBlob().then((b) => { if (live) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => live && setSrc(''));
    } else setSrc('');
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [patient.hasPhoto, patient.photoUrl]);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return save.run(async () => { throw new Error('Choose a JPG or PNG photo'); });
    if (file.size > 2 * 1024 * 1024) return save.run(async () => { throw new Error('The photo must be 2 MB or smaller'); });
    return save.run(async () => apply(await profileApi.uploadPhoto(file)));
  };

  return (
    <div className="photo-box">
      {src ? <img src={src} alt="Your profile" className="photo" /> : <div className="photo placeholder" aria-hidden="true">No photo</div>}
      <div>
        <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Choose profile photo" onChange={choose} />
        <button type="button" className="btn btn-secondary" disabled={save.busy} onClick={() => input.current.click()}>{patient.hasPhoto ? 'Change photo' : 'Add photo'}</button>
        {patient.hasPhoto && <button type="button" className="btn btn-secondary" disabled={save.busy} onClick={() => save.run(async () => apply(await profileApi.deletePhoto()))}>Remove</button>}
        <p className="hint">JPG or PNG, up to 2 MB.</p>
        {save.error && <p className="field-error" role="alert">{save.error}</p>}
      </div>
    </div>
  );
}

export default function PersonalPage() {
  const { patient, apply } = useProfile();
  const [form, setForm] = useState(() => toForm(patient));
  const save = useSave();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const body = {};
    for (const [k, v] of Object.entries(form)) if (v !== '' || (k === 'address' || k === 'city')) body[k] = v;
    const res = await save.run(async () => apply(await profileApi.savePersonal(body)));
    if (res) setForm(toForm(res.patient));
  };

  return (
    <section className="glass-card" aria-labelledby="personal-h">
      <h2 id="personal-h">Personal information</h2>
      <Photo />
      <form onSubmit={submit} noValidate>
        <div className="grid-2">
          <Field label="Full name" value={form.fullName} onChange={set('fullName')} error={save.fields.fullName} />
          <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={save.fields.dateOfBirth} hint={patient.age !== undefined ? `Age: ${patient.age}` : undefined} />
          <Field label="Gender" error={save.fields.gender}>
            {(id) => (
              <select id={id} value={form.gender} onChange={set('gender')}>
                <option value="">Select…</option>
                <option value="male">Male</option><option value="female">Female</option>
                <option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            )}
          </Field>
          <Field label="Blood group" error={save.fields.bloodGroup}>
            {(id) => (
              <select id={id} value={form.bloodGroup} onChange={set('bloodGroup')}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </Field>
          <Field label="City" value={form.city} onChange={set('city')} error={save.fields.city} />
          <Field label="Address" value={form.address} onChange={set('address')} error={save.fields.address} />
        </div>
        {save.error && <p className="form-error" role="alert">{save.error}</p>}
        {save.saved && <p className="notice" role="status">Saved.</p>}
        <button type="submit" className="btn btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save changes'}</button>
      </form>
    </section>
  );
}
