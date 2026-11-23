import { useState } from 'react';
import Button from './Button.jsx';
import { Card } from './Surface.jsx';
import { Checkbox, Field, Input } from './Form.jsx';
import EcgTrace from './EcgTrace.jsx';
import { LOGIN_PORTALS, loginMessage } from '../lib/authHeaders.js';
import { register, requestPasswordReset, signIn } from '../lib/session.js';

// Real sign-in. The tab picks which portal to try; the server still decides the account's role.
export default function LoginScreen({ initialPortal = 'patient', onBack }) {
  const [portal, setPortal] = useState(initialPortal);
  const [forgot, setForgot] = useState(false);
  const [sentNote, setSentNote] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [location, setLocation] = useState(false);
  const [fields, setFields] = useState({});
  const current = LOGIN_PORTALS.find((p) => p.id === portal);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setFields({});
    try {
      if (forgot) { const r = await requestPasswordReset(email.trim()); setSentNote(r.message); return; }
      if (creating) await register({ name: name.trim(), email: email.trim(), password, consentDataUse: agree, consentLocation: location });
      else await signIn(portal, email.trim(), password);
    } catch (err) {
      if (creating) { setFields(err.fields ?? {}); setError(Object.keys(err.fields ?? {}).length ? '' : err.message); }
      else if (forgot) setError(err.message);
      else { setError(loginMessage(err.status, err.message)); setPassword(''); }
    } finally { setBusy(false); }
  }

  return (
    <div className="paper-bg grid min-h-screen place-items-center px-4 py-8 text-ink">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="font-title text-3xl font-semibold">HealthTwin AI</h1>
          <div className="mt-1 flex items-center justify-center gap-2"><EcgTrace state="live" /><p className="text-sm text-muted">Sign in to continue</p></div>
        </div>
        <Card className="space-y-4 p-4">
          <div role="tablist" aria-label="Sign in as" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LOGIN_PORTALS.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={portal === p.id} onClick={() => { setPortal(p.id); setError(''); setFields({}); if (p.id !== 'patient') setCreating(false); }}
                className={`min-h-touch rounded-ui border px-2 text-sm font-semibold ${portal === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:bg-raised'}`}>{p.label}</button>
            ))}
          </div>
          <p className="text-sm text-muted">{forgot ? 'We will email you a link to choose a new password' : creating ? 'Create your patient account' : current.hint}</p>
          <form onSubmit={submit} className="space-y-3" noValidate>
            {creating && <Field label="Full name" error={fields.name}>{(p) => <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} {...p} />}</Field>}
            <Field label="Email" error={fields.email}>{(p) => <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} {...p} />}</Field>
            {!forgot && <Field label="Password" hint={creating ? 'At least 10 characters, with upper and lower case letters and a number' : undefined} error={error || fields.password}>{(p) => <Input type="password" autoComplete={creating ? 'new-password' : 'current-password'} required value={password} onChange={(e) => setPassword(e.target.value)} {...p} />}</Field>}
            {forgot && sentNote && <p role="status" className="text-sm">{sentNote}</p>}
            {forgot && error && <p role="alert" className="text-sm font-semibold text-critical">{error}</p>}
            {creating && (
              <div className="space-y-1">
                <Checkbox label="I agree to HealthTwin using my health data to respond to my emergencies" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                {fields.consentDataUse && <p role="alert" className="text-xs font-semibold text-critical">{fields.consentDataUse}</p>}
                <Checkbox label="Allow my location during an emergency" checked={location} onChange={(e) => setLocation(e.target.checked)} />
              </div>
            )}
            <Button type="submit" size="lg" busy={busy} disabled={!email || (!forgot && !password) || (creating && !name)} className="w-full">{forgot ? 'Email me a reset link' : creating ? 'Create account' : 'Sign in'}</Button>
            {!creating && (
              <button type="button" onClick={() => { setForgot((f) => !f); setError(''); setSentNote(''); }} className="min-h-touch w-full text-sm font-semibold text-accent underline">{forgot ? 'Back to sign in' : 'Forgot your password?'}</button>
            )}
            {portal === 'patient' && (
              <button type="button" onClick={() => { setCreating((c) => !c); setError(''); setFields({}); }} className="min-h-touch w-full text-sm font-semibold text-accent underline">
                {creating ? 'I already have an account' : 'New here? Create a patient account'}
              </button>
            )}
          </form>
        </Card>
        {onBack && <button type="button" onClick={onBack} className="min-h-touch w-full text-sm text-muted underline">Back to the start page</button>}
        <p className="text-center text-xs text-muted">Simulated data for demonstration. Not a medical device.</p>
      </div>
    </div>
  );
}
