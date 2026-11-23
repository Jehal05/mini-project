import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';
import { fetchHospitals } from '../lib/portalApi.js';
import { cell, dateInput, hasData, MASK_TEXT } from '../lib/analyticsView.js';
import { CasesPerDay, HospitalComparison, RejectionReasons, ResponseTimes, Utilisation } from './Charts.jsx';
import BackupsPanel from './BackupsPanel.jsx';
import Button from '../ui/Button.jsx';
import { Card, StatTile } from '../ui/Surface.jsx';
import { Field, Input, Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState } from '../ui/Feedback.jsx';

const KEY = 'ht.adminToken';

// Features 96 and 99. The token box is the TEMPORARY dev admin login until Jehal's real admin login exists.
export default function AdminApp({ view = 'analytics', account = null }) {
  const [pickedToken, setToken] = useState(() => sessionStorage.getItem(KEY) || '');
  const token = account ? 'session' : pickedToken; // signed in: adminFetch sends the session token, the box is hidden
  const [from, setFrom] = useState(() => dateInput(30));
  const [to, setTo] = useState(() => dateInput(0));
  const [hospitalId, setHospitalId] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchHospitals().then(setHospitals).catch(() => setHospitals([])); }, []);
  useEffect(() => { if (!account && token) sessionStorage.setItem(KEY, token); }, [account, token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ from, to, tzOffsetMinutes: String(-new Date().getTimezoneOffset()) });
      if (hospitalId) qs.set('hospitalId', hospitalId);
      setSummary(await adminFetch(token, `/admin/analytics/summary?${qs}`));
    } catch (e) {
      setSummary(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, hospitalId]);

  useEffect(() => { load(); }, [load]);

  const chart = { summary, loading, error };
  const t = summary?.totals;
  const gh = summary?.goldenHour;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        {!account && <Field label="Admin token (demo login)">{(p) => <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} {...p} />}</Field>}
        {view === 'analytics' && (
          <>
            <Field label="From">{(p) => <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} {...p} />}</Field>
            <Field label="To">{(p) => <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} {...p} />}</Field>
            <Field label="Hospital">{(p) => (
              <Select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} {...p}>
                <option value="">All hospitals</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            )}</Field>
            <Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>
          </>
        )}
      </Card>

      {!token && <Card><EmptyState icon="database" title="Enter the admin token">Use ADMIN_DEV_TOKEN from server/.env to see analytics and backups.</EmptyState></Card>}
      {token && view === 'analytics' && error && <ErrorState title="Could not load analytics" onRetry={load}>{error}</ErrorState>}
      {token && view === 'analytics' && !loading && summary && !hasData(summary) && <Card><EmptyState icon="chart" title="No data yet">Run <code>npm run seed:demo-history</code> in server/ for simulated history.</EmptyState></Card>}

      {token && view === 'analytics' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key numbers">
            <StatTile label="Cases" value={loading ? null : t ? t.cases : null} note={t && `Critical ${t.bySeverity.critical}, high ${t.bySeverity.high}`} />
            <StatTile label="Median time to accept" value={cell(summary?.responseTimes.toAccept.median, summary?.responseTimes.toAccept.masked, ' min')} />
            <StatTile label="First contact within 60 min" value={cell(gh?.firstContact.percent, gh?.firstContact.masked, '%')} note={gh?.firstContact.masked ? MASK_TEXT : undefined} />
            <StatTile label="No ambulance free" value={cell(t?.noAmbulanceAvailable.count, t?.noAmbulanceAvailable.masked)} note={`All hospitals busy: ${cell(t?.allHospitalsBusy.count, t?.allHospitalsBusy.masked)}`} />
          </div>
          {gh && (
            <ul className="flex flex-wrap gap-2 text-sm" aria-label="Golden-hour targets met">
              {gh.stages.map((s) => (
                <li key={s.key} className="glass rounded-ui border border-line px-3 py-1 text-ink">{s.label} (target {s.targetMin} min): <strong className="tnum">{cell(s.percent, s.masked, '%')}</strong> met</li>
              ))}
            </ul>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <CasesPerDay {...chart} />
            <ResponseTimes {...chart} />
            <RejectionReasons {...chart} />
            <HospitalComparison {...chart} />
            <Utilisation {...chart} />
          </div>
        </>
      )}
      {token && view === 'backups' && <BackupsPanel token={token} />}
    </div>
  );
}
