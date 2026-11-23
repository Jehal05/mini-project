import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { fmtTime, useLoad } from '../../shared/useLoad.js'
import { useSave } from '../../profile/useProfile.jsx'
import { hospitalApi } from '../../hospital/api.js'
import { responseApi } from '../api.js'
import GoldenHour from '../GoldenHour.jsx'
import { useSocketEvents } from '../hooks.js'
import MiniMap from '../MapView.jsx'
import { PREP_LABEL, REJECT_LABEL, REJECT_REASONS } from '../reasons.js'
import Timeline from '../Timeline.jsx'

function Handover({ h }) {
  const { passport: p, profile, symptoms, twin, healthSummary } = h
  const severe = p?.severeAllergies ?? []
  const symptomList = symptoms ? Object.entries({ chestPain: 'Chest pain', upperBodyPain: 'Arm, jaw, neck or back pain', shortnessOfBreath: 'Shortness of breath', nauseaOrLightheaded: 'Nausea or light-headedness' }).filter(([k]) => symptoms[k]).map(([, v]) => v) : []
  return (
    <section className="glass-card" aria-labelledby="ho-h">
      <h2 id="ho-h">Patient handover</h2>
      <p className="hint">Shown only to hospitals told about this case. Your view is logged. Access ends when the case closes.</p>
      {severe.length > 0 && <p className="notice notice-danger" role="alert"><strong>Severe allergy:</strong> {severe.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')}</p>}
      <dl className="facts">
        <div><dt>Patient</dt><dd>{profile?.fullName} <span className="mono">({p?.patientId})</span></dd></div>
        <div><dt>Blood group</dt><dd>{p?.bloodGroup ?? '—'}</dd></div>
        <div><dt>Emergency contact</dt><dd>{p?.emergencyContact ? `${p.emergencyContact.name} (${p.emergencyContact.relation}) ${p.emergencyContact.phone}` : '—'}</dd></div>
        <div><dt>Cardiac history</dt><dd>{profile?.cardiacConditions?.length ? profile.cardiacConditions.map((c) => `${c.type.replace('_', ' ')}${c.year ? ` ${c.year}` : ''}`).join(', ') : 'None recorded'}</dd></div>
        <div><dt>Medicines</dt><dd>{profile?.medications?.length ? profile.medications.map((m) => `${m.drug}${m.isBloodThinner ? ' (blood thinner)' : ''}`).join(', ') : 'None recorded'}</dd></div>
        <div><dt>Symptoms reported</dt><dd>{symptomList.length ? symptomList.join(', ') : symptoms?.noResponse ? 'No answer from the patient' : 'None reported'}</dd></div>
      </dl>
      <h3>Digital twin</h3>
      <p>Risk score <strong>{twin.riskScore ?? '—'}/100</strong>{twin.rulesFired?.length ? ` · ${twin.rulesFired.map((r) => r.message ?? r.rule).slice(0, 3).join('; ')}` : ''}</p>
      {twin.riskBreakdown?.length > 0 && <ul className="hint">{twin.riskBreakdown.map((b) => <li key={b.factor}>{b.factor}: +{b.points}</li>)}</ul>}
      <h3>Health summary</h3>
      <pre className="summary-text">{healthSummary.text}</pre>
    </section>
  )
}

/** Features 63-70: one case for the hospital: handover, accept or reject, doctor, preparation, ambulance, golden hour, timeline. */
export default function CasePage() {
  const { id } = useParams()
  const { incoming } = useOutletContext()
  const data = useLoad(() => responseApi.caseFor(id), [id])
  const doctors = useLoad(() => hospitalApi.doctors(), [])
  const fleet = useLoad(() => responseApi.ambulances(), [])
  const act = useSave()
  const [reason, setReason] = useState('no_beds')
  const [doctorId, setDoctorId] = useState('')
  const [ambulanceId, setAmbulanceId] = useState('')
  const refresh = () => { data.reload(); fleet.reload(); incoming.reload?.() }
  useSocketEvents({ 'emergency:accepted': refresh, 'emergency:taken': refresh, 'ambulance:status': refresh, 'ambulance:assigned': refresh, 'hospital:preparation': refresh, 'emergency:doctor': refresh, 'emergency:arrived': refresh, 'emergency:cancelled': refresh })
  const run = async (fn) => { if (await act.run(fn)) refresh() }

  if (data.error) return <p className="form-error" role="alert">{data.error}</p>
  const c = data.data?.case
  if (!c) return <p role="status">Loading…</p>
  const mine = c.acceptedByMe
  const pending = !c.hospital && c.status === 'searching' && c.myResponse?.status === 'notified'
  const doctorList = (doctors.data?.doctors ?? []).filter((d) => d.onDuty && d.isActive !== false)
  const free = (fleet.data?.items ?? []).filter((a) => a.status === 'available')
  const a = c.ambulance
  const points = [
    ...(c.location ? [{ id: 'patient', kind: 'patient', lng: c.location.point.coordinates[0], lat: c.location.point.coordinates[1], label: 'Patient' }] : []),
    ...(a ? [{ id: 'amb', kind: 'ambulance', lng: a.position.lng, lat: a.position.lat, label: a.vehicleNumber }] : []),
  ]
  const lines = a?.route ? [{ id: 'r1', path: a.route.toPatient }, { id: 'r2', path: a.route.toHospital, dashed: true }] : []

  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="case-h">
        <p><Link to="/hospital/incoming">← Incoming emergencies</Link></p>
        <h2 id="case-h">{c.caseNumber ?? 'Emergency'} · <span className="mono">{c.patientCode}</span></h2>
        <p>Status: <strong>{c.status.replace(/_/g, ' ')}</strong> · Level {c.severity} · risk {c.riskScore ?? '—'}/100 · started {fmtTime(c.createdAt)}</p>
        {c.hospital && !mine && <p className="notice" role="status">Accepted by another hospital.</p>}
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        {pending && (
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={act.busy} onClick={() => run(() => responseApi.accept(id))}>Accept emergency</button>
            <label className="sr-only" htmlFor="rej">Reason for rejecting</label>
            <select id="rej" value={reason} onChange={(e) => setReason(e.target.value)}>{REJECT_REASONS.map((r) => <option key={r} value={r}>{REJECT_LABEL[r]}</option>)}</select>
            <button type="button" className="btn btn-secondary" disabled={act.busy} onClick={() => run(() => responseApi.reject(id, reason))}>Reject</button>
          </div>
        )}
        <p className="emergency-calls"><a className="call-btn" href="tel:112">Call 112</a><a className="call-btn" href="tel:108">Call 108</a></p>
      </section>

      <section className="glass-card" aria-labelledby="gh-h"><h2 id="gh-h">Golden-hour timers</h2><GoldenHour stages={c.goldenHour} serverOffsetMs={incoming.offsetMs} /></section>

      {data.data.handover && <Handover h={data.data.handover} />}

      {mine && (
        <>
          <section className="glass-card" aria-labelledby="prep-h">
            <h2 id="prep-h">Preparation</h2>
            <ul className="steps">
              {Object.entries(PREP_LABEL).map(([k, label]) => (
                <li key={k}><label><input type="checkbox" checked={Boolean(c.preparation?.[k])} disabled={act.busy} onChange={(e) => run(() => responseApi.prepare(id, { [k]: e.target.checked }))} /> {label}</label></li>
              ))}
            </ul>
            <h3>Doctor</h3>
            {c.doctor ? <p>{c.doctor.name} ({c.doctor.specialization})</p> : <p className="hint">No doctor assigned yet.</p>}
            <div className="actions">
              <label className="sr-only" htmlFor="doc">Doctor on duty</label>
              <select id="doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Choose a doctor on duty</option>{doctorList.map((d) => <option key={d._id} value={d._id}>{d.fullName}{d.isCardiologist ? ' (cardiologist)' : ''}</option>)}</select>
              <button type="button" className="btn btn-secondary" disabled={!doctorId || act.busy} onClick={() => run(() => responseApi.assignDoctor(id, doctorId))}>Assign doctor</button>
            </div>
          </section>

          <section className="glass-card" aria-labelledby="amb-h">
            <h2 id="amb-h">Ambulance</h2>
            {a ? (
              <>
                <p><strong>{a.vehicleNumber}</strong> ({a.type}) · {a.stageLabel} {a.etaSeconds > 0 && `· ETA ${Math.max(1, Math.round(a.etaSeconds / 60))} min`}</p>
                <MiniMap points={points} lines={lines} />
              </>
            ) : <p className="hint">No ambulance assigned. Assign one below, or call 108.</p>}
            {(!a || a.stage === 'en_route') && (
              <div className="actions">
                <label className="sr-only" htmlFor="amb">Ambulance</label>
                <select id="amb" value={ambulanceId} onChange={(e) => setAmbulanceId(e.target.value)}><option value="">Nearest available (ALS first)</option>{free.map((v) => <option key={v._id} value={v._id}>{v.vehicleNumber} ({v.type})</option>)}</select>
                <button type="button" className="btn btn-secondary" disabled={act.busy} onClick={() => run(() => responseApi.assignAmbulance(id, ambulanceId))}>{a ? 'Replace ambulance' : 'Assign ambulance'}</button>
              </div>
            )}
            {c.status === 'arrived' && <p><Link className="btn btn-primary" to="/hospital/admissions">Admit the patient</Link></p>}
          </section>
        </>
      )}

      <section className="glass-card" aria-labelledby="tl-h"><h2 id="tl-h">Timeline</h2><Timeline events={c.timeline} /></section>
    </div>
  )
}
