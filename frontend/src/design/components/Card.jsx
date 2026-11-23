import { cx } from '../cx.js'

const EDGE = {
  normal: 'border-l-normal',
  warning: 'border-l-warning',
  critical: 'border-l-critical',
  info: 'border-l-primary',
  accent: 'border-l-accent',
}

/**
 * Frosted glass panel with an optional coloured left edge for status.
 * status: normal | warning | critical | info | accent (omit for no edge)
 */
export function Card({ title, subtitle, action, status, as: Tag = 'section', className, bodyClassName, children, ...rest }) {
  return (
    <Tag
      className={cx(
        'rounded-2xl border border-line bg-surface backdrop-blur-xl',
        'shadow-[0_8px_32px_-12px_var(--ht-shadow)]',
        status && cx('border-l-4', EDGE[status]),
        className,
      )}
      {...rest}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </Tag>
  )
}
