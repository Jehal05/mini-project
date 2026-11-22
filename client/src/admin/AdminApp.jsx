import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminApi.js';
import { fetchHospitals } from '../lib/portalApi.js';
import { cell, dateInput, hasData, MASK_TEXT } from '../lib/analyticsView.js';
import { CasesPerDay, HospitalComparison, RejectionReasons, ResponseTimes, Utilisation } from './Charts.jsx';
import BackupsPanel from './BackupsPanel.jsx';

const KEY = 'ht.adminToken';

function Tile({ label, value, note }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow">
      <div className="text-xs font-medium uppercase text-slate-600">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  );
}

// Features 96 and 99. The token box is the TEMPORARY dev admin login until Jehal's real admin login exists.
export default function AdminApp() {
  const [token, setToken] = useState(() => sessionStorage.getItem(KEY) || '');
  const [from, setFrom] = useState(() => dateInput(30));
  const [to, setTo] = useState(() => dateInput(0));
  const [hospitalId, setHospitalId] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchHospitals().then(setHospitals).catch(() => setHospitals([])); }, []);
  useEffect(() => { if (token) sessionStorage.setItem(KEY, token); }, [token]);

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
  const input = 'rounded border px-2 py-1 text-sm';
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-3 shadow">
        <label className="text-xs">Admin token (demo login)<input type="password" autoComplete="off" className={`${input} mt-1 block`} value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <label className="text-xs">From<input type="date" className={`${input} mt-1 block`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs">To<input type="date" className={`${input} mt-1 block`} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-xs">Hospital
          <select className={`${input} mt-1 block`} value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
            <option value="">All hospitals</option>
            {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <button onClick={load} className="rounded border px-3 py-1.5 text-sm">Refresh</button>
      </div>

      {!token && <p className="rounded bg-white p-4 text-sm shadow">Enter the admin token (ADMIN_DEV_TOKEN from server/.env) to see analytics and backups.</p>}
      {token && error && <p className="rounded bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {token && !loading && summary && !hasData(summary) && <p className="rounded bg-white p-3 text-sm shadow">No data yet. Run <code>npm run seed:demo-history</code> in server/ for simulated history.</p>}

      {token && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key numbers">
            <Tile label="Cases" value={loading ? '…' : t ? t.cases : '–'} note={t && `Critical ${t.bySeverity.critical}, high ${t.bySeverity.high}`} />
            <Tile label="Median to accept" value={cell(summary?.responseTimes.toAccept.median, summary?.responseTimes.toAccept.masked, ' min')} />
            <Tile label="First contact within 60 min" value={cell(gh?.firstContact.percent, gh?.firstContact.masked, '%')} note={gh?.firstContact.masked ? MASK_TEXT : undefined} />
            <Tile label="No ambulance free" value={cell(t?.noAmbulanceAvailable.count, t?.noAmbulanceAvailable.masked)} note={`All hospitals busy: ${cell(t?.allHospitalsBusy.count, t?.allHospitalsBusy.masked)}`} />
          </div>
          {gh && (
            <ul className="flex flex-wrap gap-2 text-sm" aria-label="Golden-hour targets met">
              {gh.stages.map((s) => (
                <li key={s.key} className="rounded bg-white px-3 py-1 shadow">{s.label} (target {s.targetMin} min): <strong>{cell(s.percent, s.masked, '%')}</strong> met</li>
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
          <BackupsPanel token={token} />
        </>
      )}
    </div>
  );
}
