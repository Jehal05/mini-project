import { useState } from 'react';
import { dischargeReport, patientReport } from '../reports/pdf.js';
import { profileApi } from './api.js';
import { useProfile } from './useProfile.jsx';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

/** Feature 97 for patients: download your own health report, and any discharge summary a hospital added to your history. */
export default function ReportsSection() {
  const { patient } = useProfile();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const withSummary = (patient.hospitalizations ?? []).filter((h) => h.dischargeSummaryId);

  const run = async (key, fn) => {
    setError(''); setBusy(key);
    try { await fn(); } catch (e) { setError(e.message || 'Could not create the PDF.'); } finally { setBusy(''); }
  };
  const report = () => run('report', async () => (await patientReport(patient)).save(`health-report-${patient.patientId}.pdf`));
  const summary = (h) => run(h._id, async () => {
    const data = await profileApi.dischargeSummary(h.dischargeSummaryId);
    (await dischargeReport(data)).save(`discharge-${day(h.dischargedOn).replace(/\W+/g, '-')}.pdf`);
  });

  return (
    <section className="glass-card" aria-labelledby="reports-h">
      <h2 id="reports-h">Reports</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-secondary" onClick={report} disabled={busy === 'report'}>{busy === 'report' ? 'Preparing…' : 'Download my health report (PDF)'}</button>
      <h3>Discharge summaries from hospitals</h3>
      {withSummary.length === 0 && <p className="hint">None yet. A hospital adds one here when you are discharged.</p>}
      <ul className="item-list">
        {withSummary.map((h) => (
          <li key={h._id}>
            <span>{h.hospital}{h.dischargedOn ? `, discharged ${day(h.dischargedOn)}` : ''}{h.reason ? ` — ${h.reason}` : ''}</span>
            <button type="button" className="link-btn" onClick={() => summary(h)} disabled={busy === h._id} aria-label={`Download discharge summary from ${h.hospital}`}>Download PDF</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
