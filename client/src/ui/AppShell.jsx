import Icon from './icons.jsx';
import EcgTrace from './EcgTrace.jsx';
import PillNav from './PillNav.jsx';
import { ROLES, navFor, pageTitle, showsCallBar, roleLabel } from './roles.js';
import { CONNECTION_HELP, CONNECTION_LABEL } from '../lib/connection.js';

// Frame around every role: top bar (heartbeat = connection status, demo role switch, theme), side rail or bottom
// nav, page title, and the permanent "not a medical device" line.
// The role switcher is the TEMPORARY demo login. Jehal's real login replaces it and supplies the role.
export default function AppShell({ role, onRole, account = null, onSignOut, view, onView, theme, onToggleTheme, connection, children }) {
  const nav = navFor(role);
  const calls = showsCallBar(role);
  const navButtons = () => nav.map((n) => (
    <button key={n.id} type="button" onClick={() => onView(n.id)} aria-current={view === n.id ? 'page' : undefined}
      className={`flex min-h-touch w-full items-center gap-3 rounded-ui px-3 text-sm font-semibold ${view === n.id ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-raised hover:text-ink'}`}>
      <Icon name={n.icon} size={20} />{n.label}
    </button>
  ));

  return (
    <div className="paper-bg flex min-h-screen flex-col text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-ui focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="font-title text-xl font-semibold">HealthTwin AI</span>
          <div className="flex items-center gap-2" title={CONNECTION_HELP[connection]}>
            <EcgTrace state={connection} />
            <span role="status" aria-live="polite" className="text-xs font-semibold text-muted">{CONNECTION_LABEL[connection]}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {account && (
              <div className="flex items-center gap-2">
                <span className="hidden text-right text-xs leading-tight sm:block"><span className="block font-semibold text-ink">{account.name}</span><span className="text-muted">{roleLabel(account.role)}</span></span>
                <button type="button" onClick={onSignOut} className="inline-flex min-h-touch items-center gap-1 rounded-ui border border-line bg-surface px-3 text-sm font-semibold hover:bg-raised">
                  <Icon name="user" size={16} />Sign out
                </button>
              </div>
            )}
            {!account && <label className="flex items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Demo login</span>
              <select value={role} onChange={(e) => onRole(e.target.value)} aria-label="Demo login: choose a role"
                className="min-h-touch rounded-ui border border-line bg-surface px-2 text-sm font-semibold text-ink">
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>}
            <button type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="grid min-h-touch min-w-touch place-items-center rounded-ui border border-line bg-surface hover:bg-raised">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
            </button>
          </div>
        </div>
        {calls && (
          <div className="flex items-center justify-between gap-2 bg-[rgb(179_38_30)] px-4 py-1.5 text-sm text-white">
            <span className="font-semibold">Need help right now?</span>
            <span className="flex gap-2">
              <a href="tel:112" className="inline-flex min-h-touch items-center gap-1 rounded-ui bg-white px-3 font-bold text-[rgb(179_38_30)]"><Icon name="phone" size={16} />Call 112</a>
              <a href="tel:108" className="inline-flex min-h-touch items-center gap-1 rounded-ui bg-white px-3 font-bold text-[rgb(179_38_30)]"><Icon name="phone" size={16} />Call 108</a>
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-1">
        {nav.length > 1 && (
          <nav aria-label="Sections" className="sticky top-[3.75rem] hidden h-fit w-56 shrink-0 space-y-1 p-3 md:block">{navButtons()}</nav>
        )}
        <main id="main" key={`${role}-${view}`} tabIndex={-1} className={`screen-enter min-w-0 flex-1 px-4 py-4 ${nav.length > 1 ? 'pb-24 md:pb-6' : 'pb-6'}`}>
          <h1 className="font-title mb-4 text-2xl font-semibold sm:text-3xl">{pageTitle(role, view)}</h1>
          {children}
        </main>
      </div>

      {nav.length > 1 && <PillNav items={nav} value={view} onChange={onView} />}
      <footer className={`border-t border-line bg-surface/90 px-4 py-2 text-center text-xs text-muted ${nav.length > 1 ? 'mb-20 md:mb-0' : ''}`}>
        Simulated data for demonstration. Not a medical device.
      </footer>
    </div>
  );
}
