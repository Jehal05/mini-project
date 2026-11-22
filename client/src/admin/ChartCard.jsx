// Wraps one chart with a title, loading / error / empty states, and a text table alternative.
// Colour is never the only signal: every chart has a table, and stacked bars use patterns as well as colours.
export default function ChartCard({ title, description, loading, error, empty, emptyText = 'No data yet for this date range.', columns, rows, children }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow" aria-label={title}>
      <h3 className="font-bold">{title}</h3>
      {description && <p className="text-xs text-slate-600">{description}</p>}
      <div className="mt-2">
        {loading && <p className="py-8 text-center text-sm text-slate-500" role="status">Loading…</p>}
        {!loading && error && <p className="rounded bg-red-50 p-2 text-sm text-red-800" role="alert">{error}</p>}
        {!loading && !error && empty && <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>}
        {!loading && !error && !empty && (
          <>
            <div role="img" aria-label={`${title} chart. A table with the same numbers is below.`}>{children}</div>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-blue-700">Show as table</summary>
              <table className="mt-1 w-full text-left text-xs">
                <thead>
                  <tr>{columns.map((c) => <th key={c} className="border-b py-1 pr-2">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="border-b py-1 pr-2">{v}</td>)}</tr>)}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
