import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiRequestError } from '../api/http.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { LOGIN_PORTALS, portalPath } from '../auth/roles.js';
import AuthShell from '../components/AuthShell.jsx';
import Field from '../components/Field.jsx';
import PasswordField from '../components/PasswordField.jsx';

export default function Login() {
  const { login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const initial = LOGIN_PORTALS.find((p) => p.key === params.get('portal')) ?? LOGIN_PORTALS[0];
  const [portal, setPortal] = useState(initial);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = (p) => {
    setPortal(p);
    setErrors({});
    setFormError('');
    setParams(p.key === 'patient' ? {} : { portal: p.key }, { replace: true, state: location.state });
  };

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!identifier.trim()) next.identifier = 'Enter your email or phone';
    if (!password) next.password = 'Enter your password';
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      clearNotice();
      const user = await login(portal.endpoint, identifier.trim(), password);
      const from = location.state?.from;
      const home = portalPath(user.role);
      navigate(from && (from.startsWith(home) || (home === '/hospital' && /^\/p\/[a-f0-9]{64}\/full$/.test(from))) ? from : home, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFormError(err.status === 400 ? 'Check your details and try again.' : err.message);
        if (err.details) setErrors(err.details);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Choose your portal"
      footer={portal.key === 'patient' ? <>New patient? <Link to="/register">Create an account</Link></> : <>Patient? <button type="button" className="link-btn" onClick={() => choose(LOGIN_PORTALS[0])}>Use the patient tab</button></>}
    >
      {notice && <p className="notice" role="status">{notice}</p>}
      <div role="tablist" aria-label="Portal" className="tabs">
        {LOGIN_PORTALS.map((p) => (
          <button key={p.key} type="button" role="tab" id={`tab-${p.key}`} aria-selected={portal.key === p.key} aria-controls="login-panel" tabIndex={portal.key === p.key ? 0 : -1} className={portal.key === p.key ? 'tab active' : 'tab'} onClick={() => choose(p)}>
            {p.label}
          </button>
        ))}
      </div>
      <form id="login-panel" role="tabpanel" aria-labelledby={`tab-${portal.key}`} onSubmit={onSubmit} noValidate>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <Field label="Email or phone" name="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} error={errors.identifier} />
        <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="row-between">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button type="submit" className="btn btn-primary full" disabled={busy}>{busy ? 'Signing in…' : `Sign in as ${portal.label.toLowerCase()}`}</button>
      </form>
    </AuthShell>
  );
}
