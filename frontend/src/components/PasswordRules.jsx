import { passwordRules } from '../auth/passwordRules.js';

/** Live checklist under a new-password field. */
export default function PasswordRules({ password }) {
  return (
    <ul className="rules" aria-label="Password rules">
      {passwordRules
        .filter((r) => !r.onlyWhenBroken || !r.ok(password))
        .map((r) => {
          const met = r.ok(password);
          return <li key={r.label} className={met ? 'met' : ''}>{met ? '✓' : '○'} {r.label}</li>;
        })}
    </ul>
  );
}
