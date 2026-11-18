import { cx } from '../cx.js'

/**
 * Data table.
 * columns: [{ key, header, render?(row), align?: 'left'|'right'|'center', mono?: boolean, className? }]
 * mono uses JetBrains Mono, which the plan uses for vitals, timers and IDs.
 */
export function Table({ columns, rows, rowKey = 'id', caption, empty = 'Nothing to show yet.', onRowClick, className }) {
  const keyOf = typeof rowKey === 'function' ? rowKey : (r) => r[rowKey]
  const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' }

  return (
    <div className={cx('overflow-x-auto rounded-2xl border border-line bg-surface backdrop-blur-xl', className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(
                  'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fg-muted',
                  alignClass[c.align ?? 'left'],
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-fg-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={keyOf(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx(
                  'border-b border-line last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-strong focus-visible:bg-surface-strong',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx('px-4 py-3 text-fg', alignClass[c.align ?? 'left'], c.mono && 'font-mono', c.className)}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
