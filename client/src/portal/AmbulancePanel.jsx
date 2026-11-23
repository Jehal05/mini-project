import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../lib/portalApi.js';
import { useTrip } from './useTrip.js';
import TrackingMap from './TrackingMap.jsx';
import StageTracker from './StageTracker.jsx';
import Button from '../ui/Button.jsx';
import { Select } from '../ui/Form.jsx';
import { Panel } from '../ui/Surface.jsx';
import { ErrorState } from '../ui/Feedback.jsx';

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

  return (
    <Panel title="Ambulance">
      <div className="space-y-3">
        {error && <ErrorState title="Ambulance action failed">{error}</ErrorState>}

        {!dispatched && options && (
          <div className="space-y-3 text-sm">
            {options.assigned ? (
              <p className="rounded-ui border border-low bg-low-soft p-2 text-ink">
                Reserved: <strong>{options.assigned.vehicleNumber}</strong> ({options.assigned.type}), {options.assigned.distanceKm} km from the patient
              </p>
            ) : (
              <p className="rounded-ui border border-moderate bg-moderate-soft p-2 text-ink">No ambulance is reserved. {options.candidates.length ? 'Choose one below.' : 'None is free right now. Free one up or end maintenance.'}</p>
            )}
            {options.candidates.length > 0 && (
              <div className="flex gap-2">
                <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose another ambulance">
                  <option value="">{options.assigned ? 'Change ambulance' : 'Choose an ambulance'}</option>
                  {options.candidates.map((a) => <option key={a.id} value={a.id}>{a.vehicleNumber}, {a.type}, {a.distanceKm} km</option>)}
                </Select>
                <Button variant="secondary" disabled={busy || !pick} onClick={override}>Assign</Button>
              </div>
            )}
            <Button variant="danger" disabled={busy || !options.assigned} onClick={dispatch}>Dispatch ambulance</Button>
          </div>
        )}

        {trip && (
          <>
            <StageTracker stage={trip.stage} stageTimes={trip.stageTimes} />
            <TrackingMap trip={trip} />
            {trip.stage === 'en_route_to_hospital' && <Button disabled={busy} onClick={arrive}>Confirm arrival at ED</Button>}
            {trip.stage === 'at_hospital' && <p className="rounded-ui border border-low bg-low-soft p-2 text-sm text-ink">Patient has arrived. Admission opened.</p>}
          </>
        )}
      </div>
    </Panel>
  );
}
