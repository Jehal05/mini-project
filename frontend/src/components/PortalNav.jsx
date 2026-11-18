import { NavLink } from 'react-router-dom'
import { Button, useTheme } from '../design/index.js'
import { cx } from '../design/cx.js'

const LINKS = [
  { to: '/patient/HT-2026-0001', match: '/patient', label: 'Patient dashboard' },
  { to: '/presenter', label: 'Presenter' },
  { to: '/design', label: 'Design system' },
]

/** Temporary top bar until the real portal layouts and login (Jehal, Phase 2) exist. */
export function PortalNav({ connected }) {
  const { theme, toggleTheme, motionPaused, toggleMotion } = useTheme()
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4" aria-label="Main">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/40" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-link" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l2-5 4 10 2-5h6" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-bold leading-tight">HealthTwin AI</p>
          <p className="text-xs text-fg-muted">Patient Portal</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              cx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                isActive || (l.match && window.location.pathname.startsWith(l.match)) ? 'bg-surface-strong text-fg' : 'text-fg-muted hover:text-fg',
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
        {connected !== undefined && (
          <span className="ml-2 flex items-center gap-1.5 text-xs text-fg-muted" role="status">
            <span className={cx('h-2 w-2 rounded-full', connected ? 'bg-normal' : 'bg-warning')} aria-hidden />
            {connected ? 'Live' : 'Connecting…'}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={toggleMotion} aria-pressed={motionPaused} className="ml-1">
          {motionPaused ? 'Resume motion' : 'Pause motion'}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </div>
    </nav>
  )
}
