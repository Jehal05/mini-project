import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';

const STATUS_STYLE = {
  available: 'bg-green-100 text-green-900',
  reserved: 'bg-amber-100 text-amber-900',
  dispatched: 'bg-blue-100 text-blue-900',
  on_trip: 'bg-blue-600 text-white',
  maintenance: 'bg-slate-200 text-slate-700',
};

// Features 71 and 72: register ambulances, see live counts, switch available / maintenance.
export default function FleetPanel({ hospitalId }) {
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ vehicleNumber: '', type: 'ALS', crewName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([portalFetch(hospitalId, '/ambulances'), portalFetch(hospitalId, `/hospitals/${hospitalId}/ambulances/summary`)]);
      setList(l.results);
      setSummary(s);
      setError('');
    } catch (e) { setError(e.message); }
  }, [hospitalId]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const leave = joinRoom('hospital', hospitalId);
    socket.on(EVENTS.AMBULANCE_STATUS, load); // live counts as trips move through stages
    socket.on(EVENTS.CASE_UPDATE, load);
    return () => { socket.off(EVENTS.AMBULANCE_STATUS, load); socket.off(EVENTS.CASE_UPDATE, load); leave(); };
  }, [hospitalId, load]);

  async function run(fn) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const register = (e) => {
    e.preventDefault();
    run(async () => {
      await portalFetch(hospitalId, '/ambulances', {
        method: 'POST',
        body: { vehicleNumber: form.vehicleNumber, type: form.type, crew: form.crewName.trim() ? [{ name: form.crewName.trim(), role: 'Paramedic' }] : [] },
      });
      setForm({ vehicleNumber: '', type: 'ALS', crewName: '' });
    });
  };
  const setStatus = (id, status) => run(() => portalFetch(hospitalId, `/ambulances/${id}/status`, { method: 'PATCH', body: { status } }));

  const input = 'rounded border px-2 py-1 text-sm';
  return (
    <div className="space-y-3 rounded-lg bg-white p-4 shadow">
      <h2 className="text-lg font-bold">Ambulance fleet</h2>
      {summary && (
        <p className="flex flex-wrap gap-2 text-sm" aria-label="Fleet summary">
          {Object.entries(summary.byStatus).map(([k, v]) => <span key={k} className={`rounded px-2 py-0.5 ${STATUS_STYLE[k]}`}>{k.replace('_', ' ')}: {v}</span>)}
          <span className="rounded bg-slate-100 px-2 py-0.5">ALS free: {summary.byType.ALS?.available ?? 0}/{summary.byType.ALS?.total ?? 0}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5">BLS free: {summary.byType.BLS?.available ?? 0}/{summary.byType.BLS?.total ?? 0}</span>
        </p>
      )}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <ul className="divide-y text-sm">
        {list.map((a) => {
          const label = a.reserved ? 'reserved' : a.status;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-semibold">{a.vehicleNumber}</span> · {a.type} {a.crew[0] && `· ${a.crew[0].name}`}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 ${STATUS_STYLE[label]}`}>{label.replace('_', ' ')}</span>
                {a.status === 'available' && !a.reserved && <button disabled={busy} onClick={() => setStatus(a.id, 'maintenance')} className="rounded border px-2 py-0.5">Maintenance</button>}
                {a.status === 'maintenance' && <button disabled={busy} onClick={() => setStatus(a.id, 'available')} className="rounded border px-2 py-0.5">Make available</button>}
              </span>
            </li>
          );
        })}
        {!list.length && <li className="py-2 text-slate-500">No ambulances registered.</li>}
      </ul>
      <form onSubmit={register} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <label className="text-xs">Vehicle number<input required minLength={3} className={`${input} mt-1 block`} value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} /></label>
        <label className="text-xs">Type
          <select className={`${input} mt-1 block`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>ALS</option><option>BLS</option></select>
        </label>
        <label className="text-xs">Crew lead<input className={`${input} mt-1 block`} value={form.crewName} onChange={(e) => setForm({ ...form, crewName: e.target.value })} /></label>
        <button disabled={busy} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Register ambulance</button>
      </form>
    </div>
  );
}
