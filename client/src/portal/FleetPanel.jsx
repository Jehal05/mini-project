import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { fleetMeta } from '../ui/tokens.js';
import Button from '../ui/Button.jsx';
import { Badge, Panel, StatTile } from '../ui/Surface.jsx';
import { Field, Input, Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState } from '../ui/Feedback.jsx';

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

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Fleet summary">
          {Object.entries(summary.byStatus).map(([k, v]) => <StatTile key={k} label={fleetMeta(k).label} value={v} tone={v > 0 ? fleetMeta(k).tone : 'neutral'} />)}
          <StatTile label="Advanced (ALS) free" value={`${summary.byType.ALS?.available ?? 0} of ${summary.byType.ALS?.total ?? 0}`} />
          <StatTile label="Basic (BLS) free" value={`${summary.byType.BLS?.available ?? 0} of ${summary.byType.BLS?.total ?? 0}`} />
        </div>
      )}
      {error && <ErrorState title="Fleet update failed" onRetry={load}>{error}</ErrorState>}

      <Panel title="Ambulances">
        {!list.length ? <EmptyState icon="ambulance" title="No ambulances registered">Add your first vehicle below.</EmptyState> : (
          <ul className="divide-y divide-line">
            {list.map((a) => {
              const state = a.reserved ? 'reserved' : a.status;
              const meta = fleetMeta(state);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><span className="font-semibold text-ink">{a.vehicleNumber}</span> <span className="text-muted">{a.type}{a.crew[0] && `, crew lead ${a.crew[0].name}`}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {a.status === 'available' && !a.reserved && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(a.id, 'maintenance')}>Send to maintenance</Button>}
                    {a.status === 'maintenance' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(a.id, 'available')}>Make available</Button>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Register an ambulance">
        <form onSubmit={register} className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end">
          <Field label="Vehicle number">{(p) => <Input required minLength={3} value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} {...p} />}</Field>
          <Field label="Type">{(p) => <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} {...p}><option>ALS</option><option>BLS</option></Select>}</Field>
          <Field label="Crew lead">{(p) => <Input value={form.crewName} onChange={(e) => setForm({ ...form, crewName: e.target.value })} {...p} />}</Field>
          <Button type="submit" busy={busy}>Register ambulance</Button>
        </form>
      </Panel>
    </div>
  );
}
