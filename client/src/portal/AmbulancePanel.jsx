import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import { useTrip } from './useTrip.js';
import TrackingMap from './TrackingMap.jsx';
import StageTracker from './StageTracker.jsx';

// Features 73-80 inside the case screen: assignment, override, dispatch, live tracking, arrival.
export default function AmbulancePanel({ hospitalId, caseData, onChange }) {
  const id = caseData.id;
  const dispatched = !['accepted'].includes(caseData.status);
  const [options, setOptions] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTrip = useCallback(async () => (await portalFetch(hospitalId, `/cases/${id}/trip`)).trip, [hospitalId, id]);
  const { trip, reload } = useTrip(dispatched ? id : null, loadTrip);

  const loadOptions = useCallback(async () => {
    try { setOptions(await portalFetch(hospitalId, `/cases/${id}/ambulance-options`)); } catch (e) { setError(e.message); }
  }, [hospitalId, id]);
  useEffect(() => { if (!dispatched) loadOptions(); }, [dispatched, loadOptions, caseData.ambulance]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const override = () => run(async () => { await portalFetch(hospitalId, `/cases/${id}/ambulance`, { method: 'POST', body: { ambulanceId: pick } }); setPick(''); await loadOptions(); });
  const dispatch = () => run(async () => { await portalFetch(hospitalId, `/cases/${id}/dispatch`, { method: 'POST' }); await reload(); });
  const arrive = () => run(async () => {
    await portalFetch(hospitalId, `/trips/${id}/arrive`, { method: 'POST' });
    await reload();
  });

  const btn = 'rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-50';
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase text-slate-600">Ambulance</h3>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {!dispatched && options && (
        <div className="space-y-2 text-sm">
          {options.assigned ? (
            <p className="rounded bg-green-50 p-2">
              Reserved: <strong>{options.assigned.vehicleNumber}</strong> ({options.assigned.type}), {options.assigned.distanceKm} km from the patient
            </p>
          ) : (
            <p className="rounded bg-amber-100 p-2 text-amber-900">No ambulance is reserved. {options.candidates.length ? 'Choose one below.' : 'None is free right now. Free one up or end maintenance.'}</p>
          )}
          {options.candidates.length > 0 && (
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 rounded border px-2 py-1.5" aria-label="Choose another ambulance">
                <option value="">{options.assigned ? 'Change ambulance…' : 'Choose an ambulance…'}</option>
                {options.candidates.map((a) => <option key={a.id} value={a.id}>{a.vehicleNumber} · {a.type} · {a.distanceKm} km</option>)}
              </select>
              <button disabled={busy || !pick} onClick={override} className={`${btn} border`}>Assign</button>
            </div>
          )}
          <button disabled={busy || !options.assigned} onClick={dispatch} className={`${btn} bg-red-700 text-white`}>Dispatch ambulance</button>
        </div>
      )}

      {trip && (
        <>
          <StageTracker stage={trip.stage} stageTimes={trip.stageTimes} />
          <TrackingMap trip={trip} />
          {trip.stage === 'en_route_to_hospital' && (
            <button disabled={busy} onClick={arrive} className={`${btn} bg-green-700 text-white`}>Confirm arrival at ED</button>
          )}
          {trip.stage === 'at_hospital' && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Patient has arrived. Admission opened.</p>}
        </>
      )}
    </section>
  );
}
