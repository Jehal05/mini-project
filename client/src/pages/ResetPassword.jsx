import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiRequestError, post } from '../api/http.js';
import AuthShell from '../components/AuthShell.jsx';
import PasswordField from '../components/PasswordField.jsx';
import PasswordRules from '../components/PasswordRules.jsx';
import { passwordValid } from '../auth/passwordRules.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const { status, logout } = useAuth();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <AuthShell title="Reset link missing" footer={<Link to="/login">Back to sign in</Link>}>
        <p>This page needs the link from your email. <Link to="/forgot-password">Request a new link</Link>.</p>
      </AuthShell>
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    const found = {};
    if (!passwordValid(password)) found.password = 'Your password does not meet the rules below';
    if (confirm !== password) found.confirm = 'Passwords do not match';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await post('/auth/reset-password', { token, password }, { auth: false });
      if (status === 'authenticated') await logout(); // the reset ended every session, including this one
      setDone(true);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFormError(err.message);
        if (err.details?.password) setErrors({ password: err.details.password });
      } else setFormError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Password updated" footer={<Link className="btn btn-primary full" to="/login">Sign in</Link>}>
        <p className="notice" role="status">You have been signed out everywhere. Sign in with your new password.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" footer={<Link to="/forgot-password">Need a new link?</Link>}>
      <form onSubmit={onSubmit} noValidate>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <PasswordField label="New password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <PasswordRules password={password} />
        <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <button type="submit" className="btn btn-primary full" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </AuthShell>
  );
}
