// Plan feature 95 (map): every hospital, ambulance and live case on one map. Ambulances move live over the socket.
import { useEffect, useMemo, useState } from 'react'
import { useLoad } from '../shared/useLoad.js'
import MapView from '../response/MapView.jsx'
import { useSocketEvents } from '../response/hooks.js'
import { adminOps } from './OpsApi.js'

export default function CommandMapPage() {
  const q = useLoad(() => adminOps.map(), [])
  const [live, setLive] = useState({})
  useEffect(() => { const t = setInterval(() => { setLive({}); q.reload() }, 15000); return () => clearInterval(t) }, [q.reload])
  useSocketEvents({
    'ambulance:position': (p) => setLive((l) => ({ ...l, [p.ambulanceId]: p.position })),
    'emergency:unresolved': q.reload, 'emergency:accepted': q.reload, 'ambulance:status': q.reload, 'ambulance:assigned': q.reload,
  })
  const points = useMemo(() => {
    if (!q.data) return []
    return [
      ...q.data.hospitals.map((h) => ({ id: `h-${h.id}`, kind: 'hospital', lat: h.lat, lng: h.lng, label: 'H' })),
      ...q.data.cases.map((c) => ({ id: `c-${c.id}`, kind: 'patient', lat: c.lat, lng: c.lng, label: c.caseNumber ?? c.patientCode })),
      ...q.data.ambulances.map((a) => { const p = live[a.id] ?? a; return { id: `a-${a.id}`, kind: 'ambulance', lat: p.lat, lng: p.lng, label: a.vehicleNumber } }),
    ]
  }, [q.data, live])
  const d = q.data
  return (
    <section className="glass-card" aria-labelledby="cm-h">
      <h2 id="cm-h">Command map</h2>
      <p className="hint">Simulated data for demonstration. Squares are hospitals, circles are patients with a live case, vehicles are ambulances.</p>
      {q.error && <p className="form-error" role="alert">{q.error}</p>}
      {d && <p role="status">{d.hospitals.length} hospitals · {d.ambulances.length} ambulances ({d.ambulances.filter((a) => a.status !== 'available').length} busy) · {d.cases.length} live cases</p>}
      <MapView points={points} height={460} label="Command centre map of hospitals, ambulances and live emergencies" />
    </section>
  )
}
