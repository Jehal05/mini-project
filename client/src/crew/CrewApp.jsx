import { useCallback, useEffect, useState } from 'react';
import { crewFetch, fetchCrewOptions } from '../lib/crewApi.js';
import { crewAction } from '../lib/stages.js';
import { useTrip } from '../portal/useTrip.js';
import TrackingMap from '../portal/TrackingMap.jsx';
import StageTracker from '../portal/StageTracker.jsx';
import { formatEta } from '../lib/stages.js';
import Icon from '../ui/icons.jsx';
import { Card } from '../ui/Surface.jsx';
import { Select } from '../ui/Form.jsx';
import { EmptyState, ErrorState } from '../ui/Feedback.jsx';

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
    <div className="mx-auto max-w-lg space-y-4">
      <label className="block space-y-1 text-sm font-semibold">Ambulance (demo login)
        <Select value={ambulanceId} onChange={(e) => { setAmbulanceId(e.target.value); setCaseId(null); }} className="!min-h-[3.25rem] text-base">
          <option value="">Choose your ambulance</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.vehicleNumber}, {o.type}{o.hospital ? `, ${o.hospital}` : ''}</option>)}
        </Select>
      </label>
      {(error || loadError) && <ErrorState title="Trip update failed">{error || loadError}</ErrorState>}

      {!ambulanceId && <Card><EmptyState icon="ambulance" title="Choose your ambulance">Your current trip shows here once you pick a vehicle.</EmptyState></Card>}
      {ambulanceId && !trip && <Card><EmptyState icon="clock" title="Waiting for a dispatch">A new trip appears here by itself. You do not need to refresh.</EmptyState></Card>}

      {trip && (
        <>
          <div role="status" aria-live="polite" className="rounded-ui bg-ink p-4 text-surface">
            <p className="text-sm opacity-80">Going to {trip.hospital?.name}</p>
            <p className="font-title text-3xl font-semibold leading-tight">{action.text}</p>
            {trip.stage !== 'at_hospital' && <p className="tnum mt-1 text-lg">{formatEta(trip.etaMinutes)} to {trip.activeLeg === 1 ? 'the hospital' : 'the patient'}</p>}
          </div>
          <StageTracker stage={trip.stage} stageTimes={trip.stageTimes} large />
          <TrackingMap trip={trip} height="h-64" />
          {action.kind === 'pickup' && (
            <button type="button" disabled={busy} onClick={() => act('pickup')} className="min-h-[5rem] w-full rounded-ui bg-accent text-2xl font-bold text-accent-ink disabled:opacity-50">Patient picked up</button>
          )}
          {action.kind === 'arrive' && (
            <button type="button" disabled={busy} onClick={() => act('arrive')} className="min-h-[5rem] w-full rounded-ui bg-accent text-2xl font-bold text-accent-ink disabled:opacity-50">Arrived at hospital</button>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <a href="tel:112" className="flex min-h-[4rem] items-center justify-center gap-2 rounded-ui bg-critical text-xl font-bold text-white"><Icon name="phone" size={22} />Call 112</a>
        <a href="tel:108" className="flex min-h-[4rem] items-center justify-center gap-2 rounded-ui bg-critical text-xl font-bold text-white"><Icon name="phone" size={22} />Call 108</a>
      </div>
    </div>
  );
}
