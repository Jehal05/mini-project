import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Checkbox, Field, Input, Select } from '../ui/Form.jsx';
import { Toast } from '../ui/Feedback.jsx';
import { BLOOD_GROUPS, MAX_PHOTO_BYTES, dayOf, fileProblem, initials } from '../lib/patientRecord.js';
import { deletePhoto, photoUrl, readAsBase64, savePersonal, savePhoto, savePreferences } from '../lib/patientApi.js';
import { useSaver } from './usePatient.js';

const GENDERS = [['', 'Not set'], ['female', 'Female'], ['male', 'Male'], ['other', 'Other'], ['prefer_not_to_say', 'Prefer not to say']];

export default function PersonalPanel({ patient, onChange }) {
  const [v, setV] = useState(() => ({ fullName: patient.fullName ?? '', dateOfBirth: dayOf(patient.dateOfBirth), gender: patient.gender ?? '', bloodGroup: patient.bloodGroup ?? '', address: patient.address ?? '', city: patient.city ?? '' }));
  const [saved, setSaved] = useState(false);
  const personal = useSaver((p) => { onChange(p); setSaved(true); });
  const prefs = useSaver(onChange);
  const set = (k) => (e) => { setSaved(false); setV((x) => ({ ...x, [k]: e.target.value })); };

  const submit = (e) => {
    e.preventDefault();
    // A cleared optional field is sent as '' so the server removes it.
    personal.run(() => savePersonal({ fullName: v.fullName, dateOfBirth: v.dateOfBirth, gender: v.gender, bloodGroup: v.bloodGroup, address: v.address, city: v.city }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Personal details">
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Full name" error={personal.fields.fullName}>{(p) => <Input value={v.fullName} onChange={set('fullName')} autoComplete="name" {...p} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of birth" hint={patient.age != null ? `Age ${patient.age}` : 'Age is worked out from this'} error={personal.fields.dateOfBirth}>{(p) => <Input type="date" value={v.dateOfBirth} max={dayOf(new Date())} onChange={set('dateOfBirth')} {...p} />}</Field>
            <Field label="Gender" error={personal.fields.gender}>{(p) => <Select value={v.gender} onChange={set('gender')} {...p}>{GENDERS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select>}</Field>
          </div>
          <Field label="Blood group" hint="Shown to anyone who scans your QR passport" error={personal.fields.bloodGroup}>{(p) => (
            <Select value={v.bloodGroup} onChange={set('bloodGroup')} {...p}><option value="">Not set</option>{BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</Select>)}</Field>
          <Field label="Address" error={personal.fields.address}>{(p) => <Input value={v.address} onChange={set('address')} autoComplete="street-address" {...p} />}</Field>
          <Field label="City" error={personal.fields.city}>{(p) => <Input value={v.city} onChange={set('city')} autoComplete="address-level2" {...p} />}</Field>
          {personal.error && !Object.keys(personal.fields).length && <p role="alert" className="text-sm font-semibold text-critical">{personal.error}</p>}
          <div className="flex items-center gap-3"><Button type="submit" busy={personal.busy}>Save details</Button>{saved && <span role="status" className="text-sm font-semibold text-accent">Saved</span>}</div>
        </form>
      </Panel>

      <div className="space-y-4">
        <PhotoPanel patient={patient} onChange={onChange} />
        <Panel title="Alerts and location">
          <div className="space-y-1">
            <Checkbox label="Allow location in an emergency" checked={Boolean(patient.consent?.location)} onChange={(e) => prefs.run(() => savePreferences({ locationConsent: e.target.checked }))} />
            <Checkbox label="Email my contacts" checked={patient.notificationPreferences?.email !== false} onChange={(e) => prefs.run(() => savePreferences({ email: e.target.checked }))} />
            <Checkbox label="Send web push notifications" checked={patient.notificationPreferences?.webPush !== false} onChange={(e) => prefs.run(() => savePreferences({ webPush: e.target.checked }))} />
            <Checkbox label="Offer WhatsApp messages to my contacts" checked={patient.notificationPreferences?.whatsapp !== false} onChange={(e) => prefs.run(() => savePreferences({ whatsapp: e.target.checked }))} />
          </div>
          {prefs.error && <p role="alert" className="mt-2 text-sm font-semibold text-critical">{prefs.error}</p>}
        </Panel>
      </div>
    </div>
  );
}

function PhotoPanel({ patient, onChange }) {
  const [url, setUrl] = useState('');
  const input = useRef(null);
  const saver = useSaver(onChange);
  useEffect(() => {
    let live = true; let made = '';
    if (patient.hasPhoto) photoUrl().then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); }).catch(() => setUrl(''));
    else setUrl('');
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [patient.hasPhoto]);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const problem = file && fileProblem(file, { maxBytes: MAX_PHOTO_BYTES, types: ['image/jpeg', 'image/png'] });
    if (problem) return saver.run(async () => { throw new Error(problem); });
    if (file) await saver.run(async () => savePhoto({ name: file.name, data: await readAsBase64(file) }));
    return null;
  }

  return (
    <Panel title="Photo">
      <div className="flex items-center gap-4">
        {url ? <img src={url} alt="Your profile" className="h-20 w-20 rounded-full object-cover" /> : <span aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full bg-accent/10 font-title text-2xl font-semibold text-accent">{initials(patient.fullName)}</span>}
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" id="photo-input" onChange={pick} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={saver.busy} onClick={() => input.current?.click()}>{patient.hasPhoto ? 'Change photo' : 'Add photo'}</Button>
            {patient.hasPhoto && <Button variant="quiet" onClick={() => saver.run(deletePhoto)}>Remove</Button>}
          </div>
          <p className="text-xs text-muted">JPG or PNG, up to 2 MB. Location and camera details are removed.</p>
        </div>
      </div>
      {saver.error && <div className="mt-2"><Toast tone="critical" onClose={saver.clear}>{saver.error}</Toast></div>}
    </Panel>
  );
}
