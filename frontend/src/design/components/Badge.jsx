import { cx } from '../cx.js'

const TONES = {
  normal: 'bg-normal/15 text-normal ring-normal/30',
  warning: 'bg-warning/15 text-warning ring-warning/30',
  critical: 'bg-critical/15 text-critical ring-critical/40',
  info: 'bg-primary/15 text-link ring-primary/30',
  accent: 'bg-accent/15 text-accent ring-accent/30',
  neutral: 'bg-surface-strong text-fg-muted ring-line',
}

const DEFAULT_LABELS = { normal: 'Normal', warning: 'Warning', critical: 'Critical' }

/**
 * Small status pill. tone: normal | warning | critical | info | accent | neutral.
 * Status tones show a dot as well as colour, so meaning never depends on colour alone.
 */
export function Badge({ tone = 'neutral', dot, className, children, ...rest }) {
  const showDot = dot ?? ['normal', 'warning', 'critical'].includes(tone)
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone] ?? TONES.neutral,
        className,
      )}
      {...rest}
    >
      {showDot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children ?? DEFAULT_LABELS[tone]}
    </span>
  )
}

/** The "Simulated" label every simulated value must carry. */
export function SimulatedBadge({ className }) {
  return (
    <Badge tone="accent" dot={false} className={className} title="Simulated data for demonstration. Not a medical device.">
      Simulated
    </Badge>
  )
}
