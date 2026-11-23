import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, api } from '../api/http.js';
import Field from '../components/Field.jsx';

const EMPTY = { actor: '', role: '', action: '', outcome: '', resourceType: '', resourceId: '', from: '', to: '' };

function toQuery(filters, page) {
  const q = new URLSearchParams({ page: String(page), limit: '20' });
  for (const [k, v] of Object.entries(filters)) {
    if (!v) continue;
    if (k === 'from') q.set(k, new Date(`${v}T00:00:00`).toISOString());
    else if (k === 'to') q.set(k, new Date(`${v}T23:59:59.999`).toISOString());
    else q.set(k, v.trim());
  }
  return q.toString();
}

/** Feature 98: central admins can filter the audit log. It is read-only; no control edits entries. */
export default function AuditLogViewer() {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/audit-logs?${toQuery(applied, page)}`));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const apply = (e) => { e.preventDefault(); setPage(1); setApplied(draft); };
  const reset = () => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); };

  return (
    <section className="glass-card" aria-labelledby="audit-h">
      <h2 id="audit-h">Audit log</h2>
      <p className="hint">Every login, record view, edit and denied request. Entries cannot be edited or deleted.</p>
      <form onSubmit={apply} className="filters">
        <Field label="Who (email / phone)" value={draft.actor} onChange={set('actor')} />
        <Field label="Role">
          {(id) => (
            <select id={id} value={draft.role} onChange={set('role')}>
              <option value="">Any</option>
              {['patient', 'doctor', 'hospital_staff', 'hospital_admin', 'central_admin'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </Field>
        <Field label="Action (e.g. auth.login)" value={draft.action} onChange={set('action')} />
        <Field label="Outcome">
          {(id) => (
            <select id={id} value={draft.outcome} onChange={set('outcome')}>
              <option value="">Any</option>
              <option value="success">success</option>
              <option value="failure">failure</option>
              <option value="denied">denied</option>
            </select>
          )}
        </Field>
        <Field label="Record type" value={draft.resourceType} onChange={set('resourceType')} />
        <Field label="Record ID" value={draft.resourceId} onChange={set('resourceId')} />
        <Field label="From" type="date" value={draft.from} onChange={set('from')} />
        <Field label="To" type="date" value={draft.to} onChange={set('to')} />
        <div className="actions">
          <button type="submit" className="btn btn-primary">Apply filters</button>
          <button type="button" className="btn btn-secondary" onClick={reset}>Clear</button>
        </div>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="table-wrap" aria-busy={loading}>
        <table>
          <caption className="sr-only">Audit log entries, newest first</caption>
          <thead>
            <tr><th>Time</th><th>Who</th><th>Role</th><th>Action</th><th>Record</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {data?.items.map((row) => (
              <tr key={row._id}>
                <td className="mono">{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.actorLabel ?? '—'}</td>
                <td>{row.role ?? '—'}</td>
                <td className="mono">{row.action}</td>
                <td>{row.resourceType ? `${row.resourceType}${row.resourceId ? ` · ${row.resourceId}` : ''}` : '—'}</td>
                <td><span className={`pill ${row.outcome}`}>{row.outcome}</span></td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={6}>No entries match these filters.</td></tr>}
            {!data && loading && <tr><td colSpan={6}>Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <nav className="pager" aria-label="Audit log pages">
          <button type="button" className="btn btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {data.page} of {data.pages} · {data.total} entries</span>
          <button type="button" className="btn btn-secondary" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}
