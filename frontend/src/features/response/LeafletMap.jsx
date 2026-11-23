// Features 52, 55, 76: a real map (Leaflet + OpenStreetMap tiles) with the patient pin, hospitals coloured by capability,
// the ambulance (a tilted vehicle marker), and the road routes. The pin can be dragged, or the map clicked, to set a location.
// The public OSM tile server is for development use only (its usage policy): set VITE_TILE_URL for a real deployment.
import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TONE = { patient: 'var(--ht-critical)', hospital: 'var(--ht-primary)', accepted: 'var(--ht-normal)', weak: 'var(--ht-fg-muted)', ambulance: 'var(--ht-warning)' }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// A small isometric vehicle: a lit roof, a shaded side and a ground shadow, with a blinking light bar.
const AMBULANCE_SVG = `<svg viewBox="0 0 56 40" width="52" height="37" aria-hidden="true" style="filter:drop-shadow(0 5px 3px var(--ht-shadow))">
  <ellipse cx="28" cy="35" rx="22" ry="4" fill="var(--ht-shadow)" opacity=".5"/>
  <path d="M6 14l16-7h20l8 5v14l-8 5H14l-8-4z" fill="var(--ht-fg)" opacity=".78"/>
  <path d="M6 14l16-7h20l8 5-16 7H14z" fill="var(--ht-fg)"/>
  <path d="M42 12l8 5-16 7v-5z" fill="var(--ht-primary)" opacity=".9"/>
  <rect x="19" y="13" width="4" height="9" fill="var(--ht-critical)" transform="skewY(-10)"/><rect x="16" y="16" width="10" height="3" fill="var(--ht-critical)" transform="skewY(-10)"/>
  <rect x="26" y="5" width="10" height="3" rx="1.5" fill="var(--ht-critical)" class="ht-bar"/>
  <circle cx="16" cy="30" r="3.5" fill="var(--ht-bg-to)" stroke="var(--ht-fg)" stroke-width="2"/><circle cx="40" cy="31" r="3.5" fill="var(--ht-bg-to)" stroke="var(--ht-fg)" stroke-width="2"/></svg>`

function iconFor(p) {
  if (p.kind === 'ambulance') return L.divIcon({ className: 'ht-map-ambulance', html: AMBULANCE_SVG, iconSize: [52, 37], iconAnchor: [26, 24] })
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
    return () => { map.stop(); map.off(); map.remove(); state.current = { map: null, layer: null, fitKey: '' } }
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
      map.fitBounds(b, { padding: [30, 30], maxZoom: 16, animate: false })
    }
  }, [points, lines, circles, fitKey, draggablePin])

  return (
    <figure className="mini-map" style={{ margin: 0 }}>
      <div ref={host} role="img" aria-label={label} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden' }} data-testid="leaflet-map" />
      <figcaption className="hint">Map data © OpenStreetMap contributors (development tiles). Positions and routes are simulated.{draggablePin ? ' Drag the red pin, or click the map, to set the location.' : ''}</figcaption>
    </figure>
  )
}
