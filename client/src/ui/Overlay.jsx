import { useEffect, useRef, useId } from 'react';
import Icon from './icons.jsx';

// Modal dialog: Escape closes, focus moves in and is returned, focus stays inside.
export function Modal({ open, onClose, title, children, footer, tone = 'neutral' }) {
  const ref = useRef(null); const titleId = useId(); const prev = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    prev.current = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
    (focusables()[0] ?? el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev.current?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`w-full max-w-md rounded-ui-lg border bg-surface shadow-lift ${tone === 'danger' ? 'border-critical' : 'border-line'}`}>
        <header className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${tone === 'danger' ? 'border-critical bg-critical-soft' : 'border-line'}`}>
          <h2 id={titleId} className={`font-title text-xl font-semibold ${tone === 'danger' ? 'text-critical' : 'text-ink'}`}>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid min-h-touch min-w-touch place-items-center rounded-full hover:bg-raised"><Icon name="x" size={18} /></button>
        </header>
        <div className="space-y-3 px-5 py-4 text-sm text-ink">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

// Shows on hover and keyboard focus.
export function Tooltip({ text, children }) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <span aria-describedby={id}>{children}</span>
      <span id={id} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-ui bg-ink px-2 py-1 text-xs text-surface group-focus-within:block group-hover:block">{text}</span>
    </span>
  );
}
