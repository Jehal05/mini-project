import { useState } from 'react';
import Field from '../../../components/Field.jsx';
import { incidentReport } from '../../reports/pdf.js';
import { fmtSeconds, fmtTime, useLoad } from '../../shared/useLoad.js';
import { hospitalApi } from '../api.js';

const STATUSES = ['received', 'accepted', 'rejected', 'arrived', 'admitted', 'closed'];

/** Feature 90: every case the hospital received, accepted or rejected, with outcomes and timings. Each can be exported (97). */
export default function HistoryPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const me = useLoad(() => hospitalApi.me(), []);
  const h = useLoad(() => hospitalApi.history({ page, limit: 15, ...(status && { status }) }), [status, page]);
  const [pdfError, setPdfError] = useState('');

  const exportPdf = async (c) => {
    setPdfError('');
    try { (await incidentReport(c, me.data?.hospital.name ?? 'Hospital')).save(`incident-${c.emergencyCaseId}.pdf`); } catch { setPdfError('Could not create the PDF.'); }
  };
  const pages = h.data ? Math.max(1, Math.ceil(h.data.total / h.data.limit)) : 1;

  return (
    <section className="glass-card" aria-labelledby="hist-h">
      <h2 id="hist-h">Emergency history</h2>
      {h.data && <p className="hint">{Object.entries(h.data.counts).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'No cases yet'}</p>}
      <Field label="Show">{(id) => <select id={id} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All cases</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>}</Field>
      {h.error && <p className="form-error" role="alert">{h.error}</p>}
      {pdfError && <p className="form-error" role="alert">{pdfError}</p>}
      <div className="table-wrap">
        <table className="table" aria-label="Emergency cases">
          <thead><tr><th scope="col">Received</th><th scope="col">Case</th><th scope="col">Status</th><th scope="col">Answered after</th><th scope="col">Arrived after</th><th scope="col">Outcome</th><th scope="col"><span className="sr-only">Report</span></th></tr></thead>
          <tbody>
            {h.data?.cases.map((c) => (
              <tr key={c._id}>
                <td>{fmtTime(c.receivedAt)}</td>
                <td>{c.summary ?? c.emergencyCaseId}<br /><span className="hint mono">{c.emergencyCaseId}</span></td>
                <td><span className="pill">{c.status}</span></td>
                <td>{fmtSeconds(c.respondedAfterSeconds)}</td>
                <td>{fmtSeconds(c.arrivedAfterSeconds)}</td>
                <td>{c.status === 'rejected' ? c.rejectionReason ?? 'Rejected' : c.outcome ?? '—'}</td>
                <td><button type="button" className="link-btn" onClick={() => exportPdf(c)} aria-label={`Incident report PDF for ${c.emergencyCaseId}`}>PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {h.data?.cases.length === 0 && <p className="hint">No cases.</p>}
      <div className="item-actions">
        <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </section>
  );
}
