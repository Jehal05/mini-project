import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import PortalLayout from '../../../components/PortalLayout.jsx'
import { TRIP_LABEL, TRIP_STAGES } from '../../../../../shared/response.js'
import { responseApi } from '../api.js'
import { useSocketEvents } from '../hooks.js'
import MiniMap from '../MapView.jsx'
import { PREP_LABEL } from '../reasons.js'
import Timeline from '../Timeline.jsx'
import '../response.css'

const eta = (s) => (s > 0 ? `${Math.max(1, Math.round(s / 60))} min` : '—')

/** Features 60, 67, 69, 70, 76-79: what the patient (or a family member signed in as the patient) follows during an emergency. */
function Tracker({ caseId }) {
  const [t, setT] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = () => responseApi.track(caseId).then(setT).catch((e) => setError(e.message ?? 'Could not load this emergency'))
  useEffect(() => { load() }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps
  useSocketEvents({
    'emergency:accepted': (p) => { if (p.caseId === caseId) { setMessage(p.message); load() } },
    'emergency:rejected': (p) => { if (p.caseId === caseId) { setMessage(`${p.hospital ?? 'A hospital'} could not take your case. ${p.nextHospitals?.length ? `Now asking ${p.nextHospitals.join(', ')}.` : ''}`); load() } },
    'emergency:unresolved': (p) => { if (p.caseId === caseId) setMessage(p.message) },
    'hospital:preparation': (p) => { if (p.caseId === caseId) load() },
    'emergency:doctor': (p) => { if (p.caseId === caseId) load() },
    'ambulance:assigned': (p) => { if (p.caseId === caseId) load() },
    'ambulance:status': (p) => { if (p.caseId === caseId) { setMessage(`${p.stageLabel}.`); load() } },
    'emergency:arrived': (p) => { if (p.caseId === caseId) { setMessage('You have arrived at the hospital.'); load() } },
    'ambulance:position': (p) => { if (p.caseId === caseId) setT((x) => x && x.ambulance && ({ ...x, ambulance: { ...x.ambulance, position: p.position, etaSeconds: p.etaSeconds, etaToHospitalSeconds: p.etaToHospitalSeconds, remainingKm: p.remainingKm, stage: p.stage } })) },
  })
  if (error) return <p className="form-error" role="alert">{error}</p>
  if (!t) return <p role="status">Loading…</p>
  const a = t.ambulance
  const pt = t.location?.point.coordinates
  const points = [
    ...(pt ? [{ id: 'patient', kind: 'patient', lng: pt[0], lat: pt[1], label: 'You' }] : []),
    ...t.alternatives.filter((h) => h.location).map((h) => ({ id: h.id, kind: t.hospital?.id === h.id ? 'accepted' : h.status === 'rejected' ? 'weak' : 'hospital', lng: h.location.coordinates[0], lat: h.location.coordinates[1], label: h.name.split(' ')[0] })),
    ...(a ? [{ id: 'amb', kind: 'ambulance', lng: a.position.lng, lat: a.position.lat, label: a.vehicleNumber }] : []),
  ]
  const lines = a?.route ? [{ id: 'r1', path: a.route.toPatient }, { id: 'r2', path: a.route.toHospital, dashed: true }] : []
  const i = a ? TRIP_STAGES.indexOf(a.stage) : -1
  const done = ['arrived', 'admitted', 'closed'].includes(t.status)
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="trk-h">
        <h2 id="trk-h">{t.caseNumber ?? 'Your emergency'}</h2>
        <p className="hint">Simulated data for demonstration. Not a medical device.</p>
        <p className="emergency-calls"><a className="call-btn" href="tel:112">Call 112</a><a className="call-btn" href="tel:108">Call 108</a></p>
        <p role="status" aria-live="polite"><strong>{message || (t.hospital ? `${t.hospital.name} accepted your emergency.${a ? '' : ' Ambulance being assigned.'}` : t.status === 'unresolved' ? 'No hospital has accepted yet. Call 112 now.' : t.status === 'cancelled' ? 'This emergency was cancelled.' : 'Looking for a hospital for you…')}</strong></p>
        {t.hospital && <p>Hospital: <strong>{t.hospital.name}</strong>{t.hospital.phone && <> · <a href={`tel:${t.hospital.phone}`}>{t.hospital.phone}</a></>}</p>}
        {t.doctor && <p>Doctor: {t.doctor.name} ({t.doctor.specialization})</p>}
      </section>

      {a && !done && (
        <section className="glass-card" aria-labelledby="amb-h">
          <h2 id="amb-h">Ambulance {a.vehicleNumber} ({a.type})</h2>
          <p>{a.stageLabel} · {a.stage === 'en_route' || a.stage === 'en_route_to_hospital' ? `arriving in ${eta(a.etaSeconds)}` : ''} {a.stage === 'en_route' && a.etaToHospitalSeconds > 0 ? `· at the hospital in about ${eta(a.etaToHospitalSeconds)}` : ''}</p>
          <ol className="steps" aria-label="Ambulance progress">
            {TRIP_STAGES.map((s, n) => <li key={s} className={n < i ? 'step-done' : n === i ? 'step-now' : ''} aria-current={n === i ? 'step' : undefined}>{n < i ? '✓' : n === i ? '●' : '○'} {TRIP_LABEL[s]}</li>)}
          </ol>
        </section>
      )}

      <section className="glass-card" aria-labelledby="map-h">
        <h2 id="map-h">Map</h2>
        <MiniMap points={points} lines={lines} />
      </section>

      <section className="glass-card" aria-labelledby="alt-h">
        <h2 id="alt-h">Hospitals contacted</h2>
        <ul className="item-list">
          {t.alternatives.map((h) => (
            <li key={h.id}><span>{h.rank}. <strong>{h.name}</strong> <span className="hint">{h.distanceKm} km</span></span><span className={`pill ${h.status === 'accepted' ? 'pill-vacant' : h.status === 'rejected' ? 'pill-red' : ''}`}>{{ notified: 'Waiting', accepted: 'Accepted', rejected: 'Could not take you', superseded: 'Another hospital accepted', timed_out: 'No answer' }[h.status] ?? h.status}</span></li>
          ))}
        </ul>
        {t.alternatives.length === 0 && <p className="hint">No hospital has been contacted yet.</p>}
      </section>

      {t.hospital && (
        <section className="glass-card" aria-labelledby="prep-h">
          <h2 id="prep-h">Hospital preparation</h2>
          <ul className="steps">{Object.entries(PREP_LABEL).map(([k, l]) => <li key={k} className={t.preparation?.[k] ? 'step-done' : ''}>{t.preparation?.[k] ? '✓' : '○'} {l}</li>)}</ul>
        </section>
      )}

      <section className="glass-card" aria-labelledby="tl-h"><h2 id="tl-h">What has happened</h2><Timeline events={t.timeline} /></section>
    </div>
  )
}

export default function TrackPage() {
  const { caseId } = useParams()
  const [active, setActive] = useState({ loading: !caseId })
  useEffect(() => {
    if (caseId) return
    responseApi.myActive().then((d) => setActive({ loading: false, id: d.case?.id })).catch(() => setActive({ loading: false }))
  }, [caseId])
  return (
    <PortalLayout title="Emergency response">
      <p><Link to="/patient">← Home</Link></p>
      {caseId ? <Tracker caseId={caseId} /> : active.loading ? <p role="status">Loading…</p> : active.id ? <Navigate to={`/patient/emergency/${active.id}`} replace /> : <section className="glass-card"><p>You have no emergency right now.</p><p className="emergency-calls"><a className="call-btn" href="tel:112">Call 112</a><a className="call-btn" href="tel:108">Call 108</a></p></section>}
    </PortalLayout>
  )
}
