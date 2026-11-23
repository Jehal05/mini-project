import { useId } from 'react';

const FIELD = 'min-h-touch w-full rounded-ui border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent';

export function Field({ label, hint, error, children }) {
  const id = useId();
  const described = [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">{label}</label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={`${id}-h`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-e`} role="alert" className="text-xs font-semibold text-critical">{error}</p>}
    </div>
  );
}
export const Input = (props) => <input className={FIELD} {...props} />;
export const Select = ({ children, ...p }) => <select className={FIELD} {...p}>{children}</select>;

export function Checkbox({ label, ...p }) {
  return (
    <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm text-ink">
      <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" {...p} />{label}
    </label>
  );
}
