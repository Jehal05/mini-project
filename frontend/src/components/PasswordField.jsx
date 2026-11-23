import { useState } from 'react';
import Field from './Field.jsx';

export default function PasswordField({ label = 'Password', error, hint, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => (
        <div className="password-row">
          <input id={id} type={shown ? 'text' : 'password'} aria-invalid={error ? 'true' : undefined} {...props} />
          <button type="button" className="link-btn" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
    </Field>
  );
}
