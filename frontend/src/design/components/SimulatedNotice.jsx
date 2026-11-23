import { SIMULATED_LABEL } from '@shared/vitals.js'
import { cx } from '../cx.js'

/** Team rule 3: every vitals and SOS screen shows this notice. */
export function SimulatedNotice({ className }) {
  return (
    <p
      role="note"
      className={cx(
        'rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-fg-muted',
        className,
      )}
    >
      {SIMULATED_LABEL}
    </p>
  )
}
