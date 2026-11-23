// One-tap 112 and 108 (feature 104). Always visible during an emergency. Red is for emergencies only.
import { EMERGENCY_NUMBERS } from '@shared/emergency.js'
import { cx } from '../../design/index.js'

export function CallLink({ number, label, size = 'md', className }) {
  return (
    <a
      href={`tel:${number}`}
      className={cx(
        'inline-flex items-center justify-center rounded-xl bg-critical-solid font-semibold text-critical-fg transition hover:brightness-110',
        size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
        className,
      )}
    >
      {label ?? `Call ${number}`}
    </a>
  )
}

export function CallLinks({ size = 'md', className }) {
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {EMERGENCY_NUMBERS.map((n) => (
        <CallLink key={n.number} number={n.number} size={size} label={n.number === '108' ? 'Call 108 ambulance' : `Call ${n.number}`} />
      ))}
    </div>
  )
}
