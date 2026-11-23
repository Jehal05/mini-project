// Features 52, 55, 76: a real map (Leaflet + OpenStreetMap tiles) with the patient pin, hospitals coloured by capability,
// the ambulance (a tilted vehicle marker), and the road routes. The pin can be dragged, or the map clicked, to set a location.
// The public OSM tile server is for development use only (its usage policy): set VITE_TILE_URL for a real deployment.
import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TONE = { patient: 'var(--ht-critical)', hospital: 'var(--ht-primary)', accepted: 'var(--ht-normal)', weak: 'var(--ht-fg-muted)', ambulance: 'var(--ht-warning)' }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const AMBULANCE_SVG = `<svg viewBox="0 0 48 32" width="44" height="30" aria-hidden="true" style="transform:perspective(120px) rotateX(35deg);filter:drop-shadow(0 4px 3px var(--ht-shadow))">
  <rect x="2" y="6" width="30" height="18" rx="3" fill="var(--ht-fg)"/><path d="M32 10h8l6 7v7H32z" fill="var(--ht-fg)"/>
  <rect x="35" y="12" width="7" height="5" rx="1" fill="var(--ht-primary)"/><rect x="14" y="9" width="3" height="12" fill="var(--ht-critical)"/><rect x="10" y="13" width="11" height="3" fill="var(--ht-critical)"/>
  <circle cx="11" cy="26" r="4" fill="var(--ht-bg-to)" stroke="var(--ht-fg)" stroke-width="2"/><circle cx="38" cy="26" r="4" fill="var(--ht-bg-to)" stroke="var(--ht-fg)" stroke-width="2"/></svg>`

function iconFor(p) {
  if (p.kind === 'ambulance') return L.divIcon({ className: 'ht-map-ambulance', html: AMBULANCE_SVG, iconSize: [44, 30], iconAnchor: [22, 18] })
  const tone = TONE[p.kind] ?? TONE.hospital
  const shape = p.kind === 'patient' ? 'border-radius:50%;' : 'border-radius:6px;'
  return L.divIcon({ className: 'ht-map-pin', html: `<span style="display:grid;place-items:center;width:26px;height:26px;${shape}background:${tone};border:2px solid var(--ht-fg);font:700 12px/1 system-ui;color:var(--ht-bg-to)">${p.kind === 'patient' ? '' : esc(p.label?.length <= 2 ? p.label : '')}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] })
}

export default function LeafletMap({ points, lines = [], circles = [], height = 300, label = 'Map', onPick, draggablePin = false }) {
  const host = useRef(null)
  const state = useRef({ map: null, layer: null, fitKey: '' })
  const pick = useRef(onPick)
  pick.current = onPick
  const fitKey = useMemo(() => points.map((p) => p.id).join('|'), [points])

  useEffect(() => {
    const map = L.map(host.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([18.5204, 73.8567], 12)
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map)
    state.current.layer = L.layerGroup().addTo(map)
    state.current.map = map
    map.on('click', (e) => pick.current?.({ lng: e.latlng.lng, lat: e.latlng.lat }))
    return () => { map.remove(); state.current = { map: null, layer: null, fitKey: '' } }
  }, [])

  useEffect(() => {
    const { map, layer } = state.current
    if (!map) return
    layer.clearLayers()
    for (const l of lines) {
      if (l.path?.length > 1) L.polyline(l.path.map(([lng, lat]) => [lat, lng]), { color: 'var(--ht-primary)', weight: 4, opacity: 0.85, dashArray: l.dashed ? '8 8' : undefined }).addTo(layer)
    }
    for (const c of circles) L.circle([c.lat, c.lng], { radius: c.radiusM, color: 'var(--ht-primary)', weight: 1, fillOpacity: 0.12 }).addTo(layer) // 46: GPS accuracy
    for (const p of points) {
      const m = L.marker([p.lat, p.lng], { icon: iconFor(p), keyboard: false, draggable: draggablePin && p.kind === 'patient', zIndexOffset: p.kind === 'ambulance' ? 1000 : 0 }).addTo(layer)
      if (p.label) m.bindTooltip(String(p.label), { permanent: p.kind === 'patient' || p.kind === 'ambulance', direction: 'top', offset: [0, -14] })
      if (draggablePin && p.kind === 'patient') m.on('dragend', () => { const ll = m.getLatLng(); pick.current?.({ lng: ll.lng, lat: ll.lat }) })
    }
    if (points.length && state.current.fitKey !== fitKey) {
      state.current.fitKey = fitKey
      const b = L.latLngBounds([...points.map((p) => [p.lat, p.lng]), ...lines.flatMap((l) => (l.path ?? []).map(([lng, lat]) => [lat, lng]))])
      map.fitBounds(b, { padding: [30, 30], maxZoom: 16 })
    }
  }, [points, lines, circles, fitKey, draggablePin])

  return (
    <figure className="mini-map" style={{ margin: 0 }}>
      <div ref={host} role="img" aria-label={label} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden' }} data-testid="leaflet-map" />
      <figcaption className="hint">Map data © OpenStreetMap contributors (development tiles). Positions and routes are simulated.{draggablePin ? ' Drag the red pin, or click the map, to set the location.' : ''}</figcaption>
    </figure>
  )
}
