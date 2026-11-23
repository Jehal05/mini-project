import { useState } from 'react';
import Button from './Button.jsx';
import { Card } from './Surface.jsx';
import { Field, Input } from './Form.jsx';
import EcgTrace from './EcgTrace.jsx';
import { LOGIN_PORTALS, loginMessage } from '../lib/authHeaders.js';
import { signIn } from '../lib/session.js';

// Real sign-in. The tab picks which portal to try; the server still decides the account's role.
export default function LoginScreen() {
  const [portal, setPortal] = useState('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = LOGIN_PORTALS.find((p) => p.id === portal);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await signIn(portal, email.trim(), password); }
    catch (err) { setError(loginMessage(err.status, err.message)); setPassword(''); }
    finally { setBusy(false); }
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
              <button key={p.id} type="button" role="tab" aria-selected={portal === p.id} onClick={() => { setPortal(p.id); setError(''); }}
                className={`min-h-touch rounded-ui border px-2 text-sm font-semibold ${portal === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:bg-raised'}`}>{p.label}</button>
            ))}
          </div>
          <p className="text-sm text-muted">{current.hint}</p>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field label="Email">{(p) => <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} {...p} />}</Field>
            <Field label="Password" error={error}>{(p) => <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} {...p} />}</Field>
            <Button type="submit" size="lg" busy={busy} disabled={!email || !password} className="w-full">Sign in</Button>
          </form>
        </Card>
        <p className="text-center text-xs text-muted">Simulated data for demonstration. Not a medical device.</p>
      </div>
    </div>
  );
}
