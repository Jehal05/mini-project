import { cx } from '../cx.js'

// Fixed particle positions so the background is identical on every render.
const PARTICLES = [
  { top: '8%', left: '12%', size: 180, delay: '0s' },
  { top: '62%', left: '6%', size: 120, delay: '-4s' },
  { top: '20%', left: '78%', size: 220, delay: '-8s' },
  { top: '75%', left: '70%', size: 150, delay: '-2s' },
  { top: '42%', left: '45%', size: 90, delay: '-11s' },
  { top: '88%', left: '35%', size: 110, delay: '-6s' },
]

/**
 * Layered medical background for each portal.
 *   portal="patient"  soft heartbeat glow + ECG grid
 *   portal="hospital" ECG grid; with alert, a dark red vignette
 *   portal="admin"    hospital-blueprint grid
 * Decorative layers are aria-hidden and sit behind the content at low opacity.
 */
export function MedicalBackground({ portal = 'patient', alert = false, className, children }) {
  return (
    <div className={cx('ht-bg relative min-h-screen overflow-hidden', className)} data-portal={portal}>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={cx('absolute inset-0', portal === 'admin' ? 'ht-blueprint-grid' : 'ht-ecg-grid')} />
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="ht-particle"
            style={{ top: p.top, left: p.left, width: p.size, height: p.size, animationDelay: p.delay }}
          />
        ))}
        {portal === 'patient' && <div className="ht-heartbeat-glow absolute inset-0" />}
        {portal === 'hospital' && alert && <div data-testid="alert-vignette" className="ht-alert-vignette absolute inset-0" />}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}

/** ECG line that traces across a header. Decorative. */
export function EcgLine({ className, tone = 'primary' }) {
  const color = { primary: 'var(--ht-primary)', critical: 'var(--ht-critical)', normal: 'var(--ht-normal)' }[tone]
  return (
    <svg aria-hidden viewBox="0 0 600 60" preserveAspectRatio="none" className={cx('h-10 w-full', className)}>
      <path
        className="ht-ecg-trace"
        d="M0 30 H140 l10 -4 l10 4 H200 l6 6 l10 -30 l10 44 l8 -20 H300 l14 -6 l14 6 H460 l6 6 l10 -30 l10 44 l8 -20 H600"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
