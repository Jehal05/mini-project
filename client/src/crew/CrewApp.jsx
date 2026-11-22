import { useCallback, useEffect, useState } from 'react';
import { crewFetch, fetchCrewOptions } from '../lib/crewApi.js';
import { crewAction } from '../lib/stages.js';
import { useTrip } from '../portal/useTrip.js';
import TrackingMap from '../portal/TrackingMap.jsx';
import StageTracker from '../portal/StageTracker.jsx';

const KEY = 'ht.crewAmbulance';

// Feature 107: mobile-friendly crew view. Big buttons, one action at a time.
// The ambulance picker is the TEMPORARY dev login stub until Jehal's real crew login exists.
export default function CrewApp() {
  const [options, setOptions] = useState([]);
  const [ambulanceId, setAmbulanceId] = useState(() => localStorage.getItem(KEY) || '');
  const [caseId, setCaseId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchCrewOptions().then(setOptions).catch(() => setOptions([])); }, []);
  useEffect(() => { if (ambulanceId) localStorage.setItem(KEY, ambulanceId); }, [ambulanceId]);

  const load = useCallback(async () => (await crewFetch(ambulanceId, '/trips/crew/current')).trip, [ambulanceId]);
  const { trip, reload, error: loadError } = useTrip(ambulanceId ? caseId : null, load);

  // Find the current trip, and keep looking while idle so a new dispatch appears without a refresh.
  useEffect(() => {
    if (!ambulanceId) return undefined;
    let alive = true;
    const find = async () => {
      try {
        const t = await load();
        if (alive) setCaseId(t ? t.caseId : null);
      } catch (e) { if (alive) setError(e.message); }
    };
    find();
    const timer = setInterval(find, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [ambulanceId, load]);

  async function act(kind) {
    setBusy(true);
    setError('');
    try {
      await crewFetch(ambulanceId, `/trips/${caseId}/${kind === 'pickup' ? 'pickup' : 'arrive'}`, { method: 'POST' });
      await reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const action = trip ? crewAction(trip.stage) : null;
  return (
    <div className="mx-auto max-w-lg space-y-3 p-3">
      <label className="block text-sm font-medium">
        Ambulance (demo login)
        <select value={ambulanceId} onChange={(e) => { setAmbulanceId(e.target.value); setCaseId(null); }} className="mt-1 w-full rounded border px-2 py-3 text-base">
          <option value="">Choose your ambulance</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.vehicleNumber} · {o.type}{o.hospital ? ` · ${o.hospital}` : ''}</option>)}
        </select>
      </label>
      {(error || loadError) && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error || loadError}</p>}

      {ambulanceId && !trip && <p className="rounded bg-white p-4 text-center shadow">Waiting for a dispatch…</p>}

      {trip && (
        <>
          <div className="rounded-lg bg-slate-900 p-3 text-white">
            <p className="text-sm opacity-80">{trip.hospital?.name}</p>
            <p className="text-2xl font-bold">{action.text}</p>
          </div>
          <StageTracker stage={trip.stage} stageTimes={trip.stageTimes} large />
          <TrackingMap trip={trip} height="h-64" />
          {action.kind === 'pickup' && (
            <button disabled={busy} onClick={() => act('pickup')} className="w-full rounded-lg bg-green-700 py-5 text-xl font-bold text-white disabled:opacity-50">Patient picked up</button>
          )}
          {action.kind === 'arrive' && (
            <button disabled={busy} onClick={() => act('arrive')} className="w-full rounded-lg bg-green-700 py-5 text-xl font-bold text-white disabled:opacity-50">Arrived at hospital</button>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a href="tel:112" className="rounded-lg bg-red-700 py-4 text-center text-lg font-bold text-white">Call 112</a>
        <a href="tel:108" className="rounded-lg bg-red-700 py-4 text-center text-lg font-bold text-white">Call 108</a>
      </div>
      <p className="text-center text-xs text-slate-500">Simulated data for demonstration. Not a medical device.</p>
    </div>
  );
}
