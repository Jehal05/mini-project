import { Card } from '../ui/Surface.jsx';
import { Skeleton } from '../ui/Feedback.jsx';

// Wraps one chart with a title, loading / error / empty states, and a text table alternative.
// Colour is never the only signal: every chart has a table, and stacked bars use patterns as well as colours.
export default function ChartCard({ title, description, loading, error, empty, emptyText = 'No data yet for this date range.', columns, rows, children }) {
  return (
    <Card aria-label={title} className="p-4">
      <h3 className="font-title text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="text-xs text-muted">{description}</p>}
      <div className="mt-2">
        {loading && <div role="status" aria-label="Loading"><Skeleton className="h-52" /></div>}
        {!loading && error && <p className="rounded-ui border border-critical bg-critical-soft p-2 text-sm text-ink" role="alert">{error}</p>}
        {!loading && !error && empty && <p className="py-8 text-center text-sm text-muted">{emptyText}</p>}
        {!loading && !error && !empty && (
          <>
            <div role="img" aria-label={`${title} chart. A table with the same numbers is below.`}>{children}</div>
            <details className="mt-2 text-sm">
              <summary className="min-h-touch cursor-pointer py-2 font-semibold text-accent">Show as table</summary>
              <table className="mt-1 w-full text-left text-xs">
                <thead>
                  <tr>{columns.map((c) => <th key={c} scope="col" className="border-b border-line py-1 pr-2 text-muted">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="tnum border-b border-line/60 py-1 pr-2 text-ink">{v}</td>)}</tr>)}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}
