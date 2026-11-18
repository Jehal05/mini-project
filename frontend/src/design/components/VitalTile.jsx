import { DEFAULT_THRESHOLDS, vitalStatus, formatVital } from '@shared/vitals.js'
import { cx } from '../cx.js'
import { Badge, SimulatedBadge } from './Badge.jsx'

const VALUE_COLOR = { normal: 'text-fg', warning: 'text-warning', critical: 'text-critical' }
const EDGE = { normal: 'border-l-normal', warning: 'border-l-warning', critical: 'border-l-critical' }

/**
 * One live vital (feature 29 colouring). Status comes from the shared thresholds,
 * so every portal colours a value the same way.
 * vital: 'hr' | 'sys' | 'dia' | 'spo2' | 'temp' | 'rr'
 */
export function VitalTile({ vital, value, thresholds = DEFAULT_THRESHOLDS, label, unit, className }) {
  const t = thresholds[vital]
  const status = vitalStatus(vital, value, thresholds)
  return (
    <div
      className={cx(
        'rounded-2xl border border-line border-l-4 bg-surface p-4 backdrop-blur-xl',
        EDGE[status],
        className,
      )}
      data-status={status}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label ?? t?.label ?? vital}</span>
        <Badge tone={status} />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cx('font-mono text-3xl font-semibold tabular-nums', VALUE_COLOR[status])}>
          {formatVital(vital, value, thresholds)}
        </span>
        <span className="text-sm text-fg-muted">{unit ?? t?.unit}</span>
      </div>
      <SimulatedBadge className="mt-3" />
    </div>
  )
}
