import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';
import Button from '../ui/Button.jsx';
import { Panel } from '../ui/Surface.jsx';
import { Field, Input } from '../ui/Form.jsx';
import { Table } from '../ui/Data.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';

import { actionLabel, detail } from './adminView.js';

const LIMIT = 25;
// Feature 98: who did what, newest first, with filters. Read only.
export default function AuditPanel({ token }) {
  const [f, setF] = useState({ q: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (applied.q) qs.set('q', applied.q);
    if (applied.from) qs.set('from', new Date(`${applied.from}T00:00:00`).toISOString());
    if (applied.to) qs.set('to', new Date(`${applied.to}T23:59:59`).toISOString());
    try { setData(await adminFetch(token, `/admin/audit?${qs}`)); setError(''); } catch (e) { setError(e.message); }
  }, [token, applied, page]);
  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  return (
    <Panel title="Audit log">
      <form className="mb-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(f); }}>
        <Field label="Search action or ID">{(p) => <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} maxLength={60} {...p} />}</Field>
        <Field label="From">{(p) => <Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ ...f, from: e.target.value })} {...p} />}</Field>
        <Field label="To">{(p) => <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} {...p} />}</Field>
        <Button type="submit">Apply</Button>
        <Button type="button" variant="secondary" onClick={() => { const z = { q: '', from: '', to: '' }; setF(z); setApplied(z); setPage(1); }}>Clear</Button>
      </form>
      {error && <ErrorState title="Could not load the audit log" onRetry={load}>{error}</ErrorState>}
      {!error && !data && <Skeleton className="h-40" />}
      {data && (
        <>
          <Table caption="Audit log" rowKey={(r) => r.id} empty="No entries match."
            columns={[
              { key: 'at', label: 'When', render: (r) => new Date(r.at).toLocaleString() },
              { key: 'actor', label: 'Who', render: (r) => (r.actorName ? `${r.actorName}${r.actorRole ? ` (${String(r.actorRole).replace(/_/g, ' ')})` : ''}` : (r.actorRole ?? 'system')) },
              { key: 'action', label: 'What', render: (r) => actionLabel(r.action) },
              { key: 'detail', label: 'Details', render: detail },
            ]}
            rows={data.items} />
          <div className="mt-3 flex items-center justify-between text-sm text-muted">
            <span>{data.total} entries</span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              Page {page} of {pages}
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
