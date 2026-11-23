import Icon from './icons.jsx';
import Button from './Button.jsx';
import { toneClasses } from './tokens.js';

export const Skeleton = ({ className = 'h-4 w-full' }) => <div aria-hidden="true" className={`animate-pulse rounded-ui bg-line/70 motion-reduce:animate-none ${className}`} />;

export function EmptyState({ icon = 'inbox', title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent"><Icon name={icon} size={24} /></span>
      <p className="font-title text-lg font-semibold text-ink">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

// What went wrong, then what to do. No apology.
export function ErrorState({ title = 'Could not load this', children, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-ui border border-critical bg-critical-soft p-4">
      <p className="flex items-center gap-2 font-semibold text-critical"><Icon name="triangle-alert" size={18} />{title}</p>
      {children && <p className="text-sm text-ink">{children}</p>}
      {onRetry && <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Toast({ tone = 'info', children, onClose }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-ui border px-4 py-3 text-sm shadow-lift ${toneClasses(tone).soft} ${toneClasses(tone).ring}`}>
      <span className="flex-1">{children}</span>
      {onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="grid min-h-touch min-w-touch place-items-center"><Icon name="x" size={16} /></button>}
    </div>
  );
}
