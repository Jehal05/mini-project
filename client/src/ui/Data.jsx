import Icon from './icons.jsx';
import { toneClasses } from './tokens.js';

export function Table({ caption, columns, rows, rowKey, empty = 'Nothing to show.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-line/60 last:border-0">
              {columns.map((c) => <td key={c.key} className={`tnum px-3 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Circular countdown. fraction = time left / total (0..1). The remaining time is always shown as text too.
export function ProgressRing({ fraction, size = 64, tone = 'accent', children, label }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - 8) / 2; const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)} className={toneClasses(tone).text} />
      </svg>
      <span className="tnum absolute text-xs font-semibold text-ink">{children}</span>
    </div>
  );
}

// items: [{ id, title, detail, time, done }]
export function Timeline({ items, empty = 'Nothing has happened yet.' }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="space-y-3">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3">
          <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${it.done === false ? 'border border-line text-muted' : 'bg-accent text-accent-ink'}`}><Icon name={it.done === false ? 'clock' : 'check'} size={14} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{it.title}</p>
            {it.detail && <p className="text-xs text-muted">{it.detail}</p>}
            {it.time && <p className="tnum text-xs text-muted">{it.time}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// Arrow keys move between tabs (WAI-ARIA tabs pattern).
export function Tabs({ tabs, value, onChange, label }) {
  const move = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-ui border border-line bg-raised p-1">
      {tabs.map((t, i) => (
        <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => move(e, i)}
          className={`min-h-touch rounded-ui px-4 text-sm font-semibold ${value === t.id ? 'bg-surface text-ink shadow-panel' : 'text-muted hover:text-ink'}`}>{t.label}</button>
      ))}
    </div>
  );
}
