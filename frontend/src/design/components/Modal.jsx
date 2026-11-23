import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx.js'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal dialog.
 * - Escape and the backdrop close it (unless `dismissible` is false, e.g. the emergency countdown).
 * - Focus moves inside on open, Tab is trapped, and focus returns to the opener on close.
 * tone="critical" gives the red emergency styling.
 */
export function Modal({ open, onClose, title, description, tone, dismissible = true, footer, size = 'md', children }) {
  const panelRef = useRef(null)
  const titleId = useId()
  const descId = useId()
  // Keep the latest onClose without re-running the focus effect on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const panel = panelRef.current
    const first = panel?.querySelector(FOCUSABLE)
    ;(first ?? panel)?.focus()

    function onKey(e) {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onCloseRef.current?.()
      }
      if (e.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll(FOCUSABLE)]
        if (items.length === 0) return
        const firstEl = items[0]
        const lastEl = items[items.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [open, dismissible])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        data-testid="modal-backdrop"
        className={cx('absolute inset-0 backdrop-blur-sm', tone === 'critical' ? 'bg-critical/25' : 'bg-scrim')}
        onClick={dismissible ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role={tone === 'critical' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full rounded-2xl border bg-bg-to/95 p-6 shadow-2xl backdrop-blur-xl',
          widths[size] ?? widths.md,
          tone === 'critical' ? 'border-critical/60 shadow-[0_0_60px_-10px_var(--ht-critical)]' : 'border-line',
        )}
      >
        {title && (
          <h2 id={titleId} className={cx('text-lg font-semibold', tone === 'critical' ? 'text-critical' : 'text-fg')}>
            {title}
          </h2>
        )}
        {description && (
          <p id={descId} className="mt-1 text-sm text-fg-muted">
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        {dismissible && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
