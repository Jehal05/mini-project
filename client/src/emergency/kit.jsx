// Small adapters so the SOS screens use OUR design system (src/ui). Emergencies are the only place red is used.
import UiButton from '../ui/Button.jsx';
import { Badge as UiBadge } from '../ui/Surface.jsx';
import { Modal as UiModal } from '../ui/Overlay.jsx';
import { toneClasses } from '../ui/tokens.js';

export const Badge = UiBadge;
export const Button = ({ loading, ...p }) => <UiButton busy={loading} {...p} />;

/** A panel with a title, an optional subtitle and action, and an optional coloured edge for the emergency state. */
export function Card({ title, subtitle, action, status, className = '', children, ...rest }) {
  const edge = status ? `border-l-4 ${toneClasses(status).ring}` : '';
  return (
    <section className={`glass rounded-ui border border-line shadow-panel ${edge} ${className}`} {...rest}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="font-title text-lg font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Modal({ description, children, tone, ...p }) {
  return (
    <UiModal tone={tone === 'critical' ? 'danger' : tone} {...p}>
      {description && <p className="text-sm text-muted">{description}</p>}
      {children}
    </UiModal>
  );
}

export const SimulatedNotice = ({ className = '' }) => (
  <p className={`text-xs text-muted ${className}`}>Simulated data for demonstration. Not a medical device.</p>
);
