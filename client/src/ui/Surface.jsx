import Icon from './icons.jsx';
import { severityMeta, toneClasses } from './tokens.js';

export function Card({ as: Tag = 'section', className = '', children, ...rest }) {
  return <Tag className={`rounded-ui bg-surface border border-line shadow-panel ${className}`} {...rest}>{children}</Tag>;
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <Card className={className}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="font-title text-lg font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}

// A number with its label, with the label first so screen readers read "Heart rate 126 bpm".
export function StatTile({ label, value, unit, tone = 'neutral', note, children }) {
  const t = toneClasses(tone);
  return (
    <div className="rounded-ui border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tnum mt-1 text-2xl font-semibold ${tone === 'neutral' ? 'text-ink' : t.text}`}>
        {value ?? '–'}{value != null && unit ? <span className="ml-1 text-xs font-normal text-muted">{unit}</span> : null}
      </p>
      {note && <p className={`mt-1 text-xs ${tone === 'neutral' ? 'text-muted' : t.text}`}>{note}</p>}
      {children}
    </div>
  );
}

export function Badge({ tone = 'neutral', icon, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses(tone).soft} ${className}`}>
      {icon && <Icon name={icon} size={14} />}{children}
    </span>
  );
}

// Severity is shape + word + colour.
export function SeverityBadge({ severity, solid = false }) {
  const m = severityMeta(severity);
  const t = toneClasses(m.tone);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${solid ? t.solid : t.soft}`}>
      <Icon name={m.icon} size={14} />{m.label}
    </span>
  );
}
