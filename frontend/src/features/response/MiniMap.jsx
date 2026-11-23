import { useMemo } from 'react'

const TONE = { patient: 'var(--critical)', hospital: 'var(--primary)', accepted: 'var(--normal)', weak: 'var(--text-2)', ambulance: 'var(--warning)' }

/**
 * A simplified map: points and routes drawn on a plain canvas scaled to fit. The demo has no map service (the public
 * OpenStreetMap tiles are for development only), so this says so. Every marker is also listed as text by the caller.
 * points: [{ id, kind: 'patient'|'hospital'|'accepted'|'weak'|'ambulance', lng, lat, label }]  lines: [{ id, path: [[lng, lat]...], dashed? }]
 */
export default function MiniMap({ points, lines = [], height = 280, label = 'Map of the patient, hospitals and ambulance' }) {
  const view = useMemo(() => {
    const all = [...points.map((p) => [p.lng, p.lat]), ...lines.flatMap((l) => l.path)]
    if (!all.length) return null
    const lngs = all.map((p) => p[0])
    const lats = all.map((p) => p[1])
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    const w = Math.max((Math.max(...lngs) - Math.min(...lngs)) * kx, 0.004)
    const h = Math.max(Math.max(...lats) - Math.min(...lats), 0.004)
    const W = 600
    const H = Math.round(Math.min(480, Math.max(160, (W * h) / w)))
    const pad = 36
    const sx = (W - pad * 2) / w
    const sy = (H - pad * 2) / h
    const s = Math.min(sx, sy)
    const ox = pad + ((W - pad * 2) - w * s) / 2
    const oy = pad + ((H - pad * 2) - h * s) / 2
    return { W, H, x: (lng) => ox + (lng - Math.min(...lngs)) * kx * s, y: (lat) => oy + (Math.max(...lats) - lat) * s }
  }, [points, lines])
  if (!view) return null
  return (
    <figure className="mini-map">
      <svg viewBox={`0 0 ${view.W} ${view.H}`} role="img" aria-label={label} style={{ width: '100%', maxHeight: height }}>
        <rect x="0" y="0" width={view.W} height={view.H} rx="10" className="mini-map-bg" />
        {lines.map((l) => (
          <polyline key={l.id} fill="none" stroke="var(--primary)" strokeWidth="3" strokeDasharray={l.dashed ? '6 6' : undefined} strokeLinecap="round"
            points={l.path.map(([lng, lat]) => `${view.x(lng).toFixed(1)},${view.y(lat).toFixed(1)}`).join(' ')} />
        ))}
        {points.map((p) => (
          <g key={p.id} transform={`translate(${view.x(p.lng).toFixed(1)} ${view.y(p.lat).toFixed(1)})`}>
            {p.kind === 'ambulance' ? <rect x="-9" y="-9" width="18" height="18" rx="4" fill={TONE.ambulance} stroke="var(--bg-from)" strokeWidth="1.5" />
              : p.kind === 'patient' ? <circle r="9" fill={TONE.patient} stroke="var(--text)" strokeWidth="2.5" />
                : <path d="M0 -12 L9 6 L-9 6 Z" fill={TONE[p.kind] ?? TONE.hospital} stroke="var(--bg-from)" strokeWidth="1.5" />}
            <text y={p.kind === 'ambulance' ? 24 : -16} textAnchor="middle" className="mini-map-label">{p.label}</text>
          </g>
        ))}
      </svg>
      <figcaption className="hint">Simplified map for the demo. Positions and routes are simulated.</figcaption>
    </figure>
  )
}
