import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PortalLayout from '../../../components/PortalLayout.jsx'
import { responseApi } from '../api.js'
import MiniMap from '../MiniMap.jsx'
import '../response.css'

// Manual fallback when the browser will not share a location (feature 51). Real coordinates of Pune areas.
const AREAS = { 'Shivajinagar': [73.8478, 18.5314], 'Kothrud': [73.8077, 18.5074], 'Hadapsar': [73.926, 18.5089], 'Hinjewadi': [73.7389, 18.5912], 'Pimpri': [73.7997, 18.6279] }

/** Features 51, 55-59: pick a location, see nearby hospitals on a map and in a list with the score breakdown. */
export default function HospitalFinderPage() {
  const [where, setWhere] = useState({ source: 'manual', label: 'Shivajinagar', point: AREAS.Shivajinagar })
  const [cardiac, setCardiac] = useState(true)
  const [q, setQ] = useState('')
  const [res, setRes] = useState({ items: [], loading: true, error: '' })
  const [geoMsg, setGeoMsg] = useState('')

  useEffect(() => {
    let live = true
    setRes((r) => ({ ...r, loading: true, error: '' }))
    const t = setTimeout(() => {
      responseApi.nearby({ lng: where.point[0], lat: where.point[1], radiusKm: 30, cardiac: cardiac ? '1' : '', q }).then((d) => live && setRes({ items: d.items, loading: false, error: '' })).catch((e) => live && setRes({ items: [], loading: false, error: e.message }))
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [where, cardiac, q])

  const useMyLocation = () => {
    if (!navigator.geolocation) return setGeoMsg('This browser cannot share a location. Pick an area instead.')
    setGeoMsg('Asking for your location…')
    navigator.geolocation.getCurrentPosition(
      (p) => { setWhere({ source: 'gps', label: 'Your location', point: [p.coords.longitude, p.coords.latitude] }); setGeoMsg('') },
      () => setGeoMsg('Location was not shared. Pick an area instead.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }
  const points = [{ id: 'me', kind: 'patient', lng: where.point[0], lat: where.point[1], label: where.label }, ...res.items.map((h, n) => ({ id: h.id, kind: h.cardiacCapable ? 'accepted' : 'weak', lng: h.location.coordinates[0], lat: h.location.coordinates[1], label: `${n + 1}` }))]
  return (
    <PortalLayout title="Hospitals near you">
      <p><Link to="/patient">← Home</Link></p>
      <section className="glass-card" aria-labelledby="f-h">
        <h2 id="f-h">Where are you?</h2>
        <div className="filters">
          <button type="button" className="btn btn-secondary" onClick={useMyLocation}>Use my location</button>
          <label htmlFor="area">or choose an area</label>
          <select id="area" value={where.source === 'manual' ? where.label : ''} onChange={(e) => e.target.value && setWhere({ source: 'manual', label: e.target.value, point: AREAS[e.target.value] })}><option value="">—</option>{Object.keys(AREAS).map((a) => <option key={a}>{a}</option>)}</select>
          <label htmlFor="q">Search by name or area</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          <label><input type="checkbox" checked={cardiac} onChange={(e) => setCardiac(e.target.checked)} /> Cardiac care only (cath lab, cardiologist on duty or free CCU bed)</label>
        </div>
        {geoMsg && <p className="hint" role="status">{geoMsg}</p>}
        <p className="hint">Hospitals are fictional demo data. Simulated for demonstration. In a real emergency call 112 or 108.</p>
        <p className="emergency-calls"><a className="call-btn" href="tel:112">Call 112</a><a className="call-btn" href="tel:108">Call 108</a></p>
      </section>
      <section className="glass-card" aria-labelledby="m-h">
        <h2 id="m-h">Map</h2>
        <MiniMap points={points} />
      </section>
      <section className="glass-card" aria-labelledby="l-h">
        <h2 id="l-h">Ranked hospitals</h2>
        {res.error && <p className="form-error" role="alert">{res.error}</p>}
        {!res.loading && !res.items.length && !res.error && <p className="hint">No hospitals match. Try turning off the cardiac filter.</p>}
        <ol className="item-list">
          {res.items.map((h) => (
            <li key={h.id}>
              <span><strong>{h.name}</strong> <span className="hint">{h.address}</span>
                <span className="chips">
                  <span className={`pill ${h.capability.cathLab ? 'chip-ok' : 'chip-no'}`}>Cath lab {h.capability.cathLab ? 'yes' : 'no'}</span>
                  <span className={`pill ${h.capability.cardiologistOnDuty ? 'chip-ok' : 'chip-no'}`}>Cardiologist {h.capability.cardiologistOnDuty ? 'on duty' : 'off duty'}</span>
                  <span className="pill">CCU free {h.capability.freeCcu}</span><span className="pill">ICU free {h.capability.freeIcu}</span><span className="pill">ALS ambulances {h.capability.alsFree}</span>
                </span></span>
              <span>{h.distanceKm} km · score <strong>{h.score}</strong><br /><span className="hint">distance {h.breakdown.distance} + capability {h.breakdown.capability} + load {h.breakdown.load}</span></span>
            </li>
          ))}
        </ol>
      </section>
    </PortalLayout>
  )
}
