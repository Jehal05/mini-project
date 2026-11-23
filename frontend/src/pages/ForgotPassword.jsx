import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiRequestError, post } from '../api/http.js';
import AuthShell from '../components/AuthShell.jsx';
import Field from '../components/Field.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter the email you registered with'); return; }
    setBusy(true);
    try {
      const data = await post('/auth/forgot-password', { email: email.trim() }, { auth: false });
      setDone(data.message);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="We’ll email you a reset link" footer={<Link to="/login">Back to sign in</Link>}>
      {done ? (
        <p className="notice" role="status">{done}</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Field label="Email" type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <button type="submit" className="btn btn-primary full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  );
}
