import { useMemo, useState } from 'react'
import { useLoad } from '../../shared/useLoad.js'
import { useSave } from '../../profile/useProfile.jsx'
import { responseApi } from '../api.js'
import { useSocketEvents } from '../hooks.js'
import MiniMap from '../MapView.jsx'
import { TRIP_LABEL, TRIP_STAGES } from '../../../../../shared/response.js'

const NEXT_BUTTON = { at_patient: 'We are at the patient', patient_on_board: 'Patient on board', en_route_to_hospital: 'Leaving for the hospital', at_hospital: 'We are at the hospital' }

/** Feature 107: the crew's phone screen. One trip, big buttons that drive features 78-80, a navigation link. */
export default function CrewPage() {
  const fleet = useLoad(() => responseApi.ambulances(), [])
  const [pick, setPick] = useState('')
  const act = useSave()
  const trips = useMemo(() => (fleet.data?.items ?? []).filter((a) => a.trip?.caseId), [fleet.data])
  const live = trips.find((a) => a._id === pick) ?? trips[0]
  const c = useLoad(() => (live ? responseApi.caseFor(live.trip.caseId) : Promise.resolve(null)), [live?.trip?.caseId])
  useSocketEvents({ 'ambulance:position': (p) => { if (p.stage === 'en_route' || p.stage === 'en_route_to_hospital') fleet.reload() }, 'ambulance:status': fleet.reload, 'ambulance:assigned': fleet.reload, 'emergency:cancelled': fleet.reload })
  const run = async (fn) => { if (await act.run(fn)) { fleet.reload(); c.reload() } }

  if (fleet.loading) return <p role="status">Loading…</p>
  if (!live) return <section className="glass-card"><h2>Crew view</h2><p className="hint">No trip right now. A trip appears here when your hospital accepts an emergency and an ambulance is dispatched.</p></section>

  const stage = live.trip.stage
  const i = TRIP_STAGES.indexOf(stage)
  const next = TRIP_STAGES[i + 1]
  const goingToHospital = i >= 2
  const dest = goingToHospital ? live.trip.hospitalPoint : live.trip.patientPoint
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${dest[1]},${dest[0]}&travelmode=driving`
  const address = c.data?.case?.location?.address
  const points = [
    { id: 'amb', kind: 'ambulance', lng: live.position.coordinates[0], lat: live.position.coordinates[1], label: live.vehicleNumber },
    { id: 'dest', kind: goingToHospital ? 'accepted' : 'patient', lng: dest[0], lat: dest[1], label: goingToHospital ? 'Hospital' : 'Patient' },
  ]
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="crew-h">
        <h2 id="crew-h">Crew view · {live.vehicleNumber} ({live.type})</h2>
        <p className="hint">Simulated trip for demonstration. Not a medical device.</p>
        {trips.length > 1 && (<><label htmlFor="trip-pick">Trip</label><select id="trip-pick" value={live._id} onChange={(e) => setPick(e.target.value)}>{trips.map((t) => <option key={t._id} value={t._id}>{t.vehicleNumber}</option>)}</select></>)}
        <p><strong>{TRIP_LABEL[stage]}</strong>{address ? ` · ${address}` : ''}</p>
        <ol className="steps" aria-label="Trip stages">
          {TRIP_STAGES.map((s, n) => <li key={s} className={n < i ? 'step-done' : n === i ? 'step-now' : ''} aria-current={n === i ? 'step' : undefined}>{n < i ? '✓' : n === i ? '●' : '○'} {TRIP_LABEL[s]}</li>)}
        </ol>
        <MiniMap points={points} lines={[{ id: 'leg', path: [live.trip.legFrom, live.trip.legTo], dashed: true }]} />
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        <div className="big-actions">
          <a className="btn btn-secondary" href={nav} target="_blank" rel="noreferrer">Open navigation</a>
          {next && NEXT_BUTTON[next] && <button type="button" className="btn btn-primary" disabled={act.busy} onClick={() => run(() => responseApi.trip(live.trip.caseId, next))}>{NEXT_BUTTON[next]}</button>}
          {stage === 'at_hospital' && <button type="button" className="btn btn-primary" disabled={act.busy} onClick={() => run(() => responseApi.arrival(live.trip.caseId))}>Confirm arrival</button>}
        </div>
        <p className="emergency-calls"><a className="call-btn" href="tel:112">Call 112</a><a className="call-btn" href="tel:108">Call 108</a></p>
      </section>
    </div>
  )
}
