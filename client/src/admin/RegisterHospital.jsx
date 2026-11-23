import { useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Checkbox, Field, Input } from '../ui/Form.jsx';
import { Toast } from '../ui/Feedback.jsx';

import { registrationBody } from './adminView.js';

const BLANK = { code: '', name: '', address: '', area: '', phone: '', latitude: '', longitude: '', cathLab: false, adminName: '', adminEmail: '', adminPassword: '' };

// Feature 81, central side: add a hospital and the account of its first administrator.
export default function RegisterHospital({ token }) {
  const [f, setF] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErrors({}); setError(''); setDone(null);
    try {
      const r = await adminFetch(token, '/admin/hospitals', { method: 'POST', body: registrationBody(f) });
      setDone(r); setF(BLANK);
    } catch (err) { setErrors(err.fields ?? {}); setError(err.fields ? 'Please check the highlighted fields.' : err.message); } finally { setBusy(false); }
  }
  return (
    <Panel title="Register a hospital">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field label="Hospital code" hint="Short and unique, like PUNE-HEART" error={errors.code}>{(p) => <Input {...bind('code')} maxLength={20} required {...p} />}</Field>
        <Field label="Hospital name" error={errors.name}>{(p) => <Input {...bind('name')} maxLength={120} required {...p} />}</Field>
        <Field label="Address" error={errors.address}>{(p) => <Input {...bind('address')} maxLength={200} {...p} />}</Field>
        <Field label="Area" error={errors.area}>{(p) => <Input {...bind('area')} maxLength={80} {...p} />}</Field>
        <Field label="Phone" error={errors.phone}>{(p) => <Input type="tel" {...bind('phone')} {...p} />}</Field>
        <Checkbox label="Has a cath lab" checked={f.cathLab} onChange={(e) => setF({ ...f, cathLab: e.target.checked })} />
        <Field label="Latitude" error={errors.latitude}>{(p) => <Input type="number" step="any" {...bind('latitude')} required {...p} />}</Field>
        <Field label="Longitude" error={errors.longitude}>{(p) => <Input type="number" step="any" {...bind('longitude')} required {...p} />}</Field>
        <Field label="Administrator name" error={errors.adminName}>{(p) => <Input {...bind('adminName')} maxLength={120} required {...p} />}</Field>
        <Field label="Administrator email" error={errors.adminEmail}>{(p) => <Input type="email" autoComplete="off" {...bind('adminEmail')} required {...p} />}</Field>
        <Field label="Starting password" hint="At least 10 characters with upper and lower case letters and a number. Tell the administrator to change it." error={errors.adminPassword}>{(p) => <Input type="password" autoComplete="new-password" {...bind('adminPassword')} required {...p} />}</Field>
        <div className="flex items-end"><Button type="submit" busy={busy}>Register hospital</Button></div>
      </form>
      {done && <div className="mt-3"><Toast tone="info" onClose={() => setDone(null)}>{done.hospital.name} ({done.hospital.code}) is registered. {done.admin.email} can now sign in as its administrator.</Toast></div>}
      {error && <div className="mt-3"><Toast tone="critical" onClose={() => setError('')}>{error}</Toast></div>}
    </Panel>
  );
}
