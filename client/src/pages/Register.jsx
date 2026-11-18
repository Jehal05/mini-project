import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../api/http.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { portalPath } from '../auth/roles.js';
import AuthShell from '../components/AuthShell.jsx';
import Field from '../components/Field.jsx';
import PasswordField from '../components/PasswordField.jsx';

export const passwordRules = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['A letter', (p) => /[A-Za-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '', dataUse: false, location: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function validate() {
    const e = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (!form.email.trim() && !form.phone.trim()) e.email = 'Enter an email or a phone number';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email';
    if (!passwordRules.every(([, ok]) => ok(form.password))) e.password = 'Your password does not meet the rules below';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';
    if (!form.dataUse) e.dataUse = 'You must agree to data use to create an account';
    return e;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const user = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        consent: { dataUse: form.dataUse, location: form.location },
      });
      navigate(portalPath(user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFormError(err.status === 400 ? 'Please fix the highlighted fields.' : err.message);
        if (err.code === 'ACCOUNT_EXISTS') setErrors({ email: err.message });
        else if (err.details) setErrors({ ...err.details, dataUse: err.details['consent.dataUse'] });
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Patient registration" wide footer={<>Already registered? <Link to="/login">Sign in</Link></>}>
      <form onSubmit={onSubmit} noValidate>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <Field label="Full name" name="fullName" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
        <div className="grid-2">
          <Field label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
          <Field label="Phone (optional if you gave an email)" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} hint="10-digit Indian number or with country code" />
        </div>
        <PasswordField label="Password" name="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <ul className="rules" aria-label="Password rules">
          {passwordRules.map(([label, ok]) => (
            <li key={label} className={ok(form.password) ? 'met' : ''}>{ok(form.password) ? '✓' : '○'} {label}</li>
          ))}
        </ul>
        <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />

        <fieldset className="consents">
          <legend>Consent</legend>
          <label className="check">
            <input type="checkbox" checked={form.dataUse} onChange={set('dataUse')} aria-invalid={errors.dataUse ? 'true' : undefined} />
            <span>I agree that HealthTwin AI may store my health information to run emergency alerts. <em>(required)</em></span>
          </label>
          {errors.dataUse && <p className="field-error" role="alert">{errors.dataUse}</p>}
          <label className="check">
            <input type="checkbox" checked={form.location} onChange={set('location')} />
            <span>I allow use of my location to find nearby hospitals during an emergency. <em>(recommended)</em></span>
          </label>
        </fieldset>
        <p className="hint">Demonstration project: simulated data, fictional patients only. Not a medical device.</p>
        <button type="submit" className="btn btn-primary full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}
