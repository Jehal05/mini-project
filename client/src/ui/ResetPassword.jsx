import { useState } from 'react';
import Button from './Button.jsx';
import { Card } from './Surface.jsx';
import { Field, Input } from './Form.jsx';
import { resetPassword } from '../lib/session.js';

// Feature 7: the page behind the link in the reset email (/?reset=TOKEN).
export default function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const mismatch = again && password !== again ? 'The two passwords are different' : undefined;

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await resetPassword(token, password); setDone(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="paper-bg grid min-h-screen place-items-center px-4 py-8 text-ink">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-center font-title text-3xl font-semibold">Choose a new password</h1>
        <Card className="space-y-4 p-4">
          {done ? (
            <>
              <p role="status" className="text-sm">Your password is changed. Sign in with the new one.</p>
              <Button size="lg" className="w-full" onClick={onDone}>Go to sign in</Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-3" noValidate>
              <Field label="New password" hint="At least 10 characters, with upper and lower case letters and a number">{(p) => <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} {...p} />}</Field>
              <Field label="Type it again" error={mismatch}>{(p) => <Input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} {...p} />}</Field>
              {error && <p role="alert" className="text-sm font-semibold text-critical">{error}</p>}
              <Button type="submit" size="lg" busy={busy} disabled={!password || password !== again} className="w-full">Change password</Button>
              <button type="button" onClick={onDone} className="min-h-touch w-full text-sm font-semibold text-accent underline">Back to sign in</button>
            </form>
          )}
        </Card>
        <p className="text-center text-xs text-muted">Simulated data for demonstration. Not a medical device.</p>
      </div>
    </div>
  );
}
