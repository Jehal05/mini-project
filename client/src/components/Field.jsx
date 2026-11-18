import { useId } from 'react';

/** Labelled input with its error wired up for screen readers. */
export default function Field({ label, error, hint, type = 'text', children, ...props }) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? children(id) : (
        <input id={id} type={type} aria-invalid={error ? 'true' : undefined} aria-describedby={[error && errId, hint && hintId].filter(Boolean).join(' ') || undefined} {...props} />
      )}
      {hint && <p id={hintId} className="hint">{hint}</p>}
      {error && <p id={errId} className="field-error" role="alert">{error}</p>}
    </div>
  );
}
