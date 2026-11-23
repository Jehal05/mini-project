import { useCallback, useEffect, useState } from 'react';
import { fetchHistory } from '../lib/hospitalApi.js';
import Button from '../ui/Button.jsx';
import { Badge, SeverityBadge } from '../ui/Surface.jsx';
import { Table, Tabs } from '../ui/Data.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { HISTORY_TABS, OUTCOMES, formatSeconds } from './labels.js';

// Feature 90: every emergency this hospital was alerted about and how it ended for this hospital.
// The patient's name appears only for cases this hospital accepted.
export default function History() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setData(null); return fetchHistory({ status, page }).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)); }, [status, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <Tabs label="Filter history" value={status} onChange={(s) => { setStatus(s); setPage(1); }} tabs={HISTORY_TABS.map(([id, label]) => ({ id, label }))} />
      {error && <ErrorState onRetry={load}>{error}</ErrorState>}
      {!error && !data && <Skeleton className="h-40" />}
      {data && (
        <>
          <Table caption="Emergency history" rowKey={(r) => r.caseId} empty="No emergencies in this view." rows={data.items}
            columns={[
              { key: 'alertedAt', label: 'Alerted', render: (r) => (r.alertedAt ? new Date(r.alertedAt).toLocaleString() : '–') },
              { key: 'severity', label: 'Severity', render: (r) => (r.severity ? <SeverityBadge severity={r.severity} /> : '–') },
              { key: 'outcome', label: 'For us', render: (r) => <Badge tone={OUTCOMES[r.outcome]?.tone}>{OUTCOMES[r.outcome]?.label ?? r.outcome}</Badge> },
              { key: 'patient', label: 'Patient', render: (r) => (r.patientName ? `${r.patientName} (${r.patientId})` : 'Not shown') },
              { key: 'resp', label: 'We answered in', render: (r) => formatSeconds(r.respondedAfterSeconds) },
            ]} />
          <div className="flex items-center gap-3 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-muted">Page {data.page} of {data.pages} · {data.total} case{data.total === 1 ? '' : 's'}</span>
            <Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
          <p className="text-xs text-muted">Simulated data for demonstration. Not a medical device. Patient names are shown only for emergencies your hospital accepted.</p>
        </>
      )}
    </div>
  );
}
