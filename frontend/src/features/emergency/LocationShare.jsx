// Feature 46: share the live location with the case. GPS first; if the browser has none or the person
// said no, a manual fallback. (The map with the accuracy circle belongs to the GPS/map features 51-52.)
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card } from '../../design/index.js'
import { emergencyApi } from './api.js'

const SEND_EVERY_MS = 10_000

export function LocationShare({ caseId, location }) {
  const [mode, setMode] = useState(() => (globalThis.navigator?.geolocation ? 'gps' : 'manual'))
  const [form, setForm] = useState({ lat: '', lng: '', address: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const lastSent = useRef(0)

  useEffect(() => {
    if (mode !== 'gps') return undefined
    const geo = globalThis.navigator?.geolocation
    if (!geo) {
      setMode('manual')
      return undefined
    }
    const watch = geo.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastSent.current < SEND_EVERY_MS) return
        lastSent.current = now
        emergencyApi
          .location(caseId, { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy), source: 'gps' })
          .then(() => setError(null))
          .catch((e) => setError(e.message))
      },
      () => setMode('manual'), // permission denied or no signal: fall back to manual
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    return () => geo.clearWatch?.(watch)
  }, [mode, caseId])

  async function saveManual(e) {
    e.preventDefault()
    const lat = Number(form.lat)
    const lng = Number(form.lng)
    if (form.lat.trim() === '' || form.lng.trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setError('Enter latitude (-90 to 90) and longitude (-180 to 180) as numbers.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await emergencyApi.location(caseId, { lat, lng, source: 'manual', ...(form.address.trim() && { address: form.address.trim() }) })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const p = location?.point?.coordinates
  return (
    <Card title="Your location" subtitle="Shared with the emergency case" action={<Badge tone={p ? 'normal' : 'warning'}>{p ? 'Shared' : 'Not shared yet'}</Badge>}>
      {p ? (
        <p className="text-sm">
          <span className="font-mono">
            {p[1].toFixed(5)}, {p[0].toFixed(5)}
          </span>
          {location.accuracyM != null && <span className="text-fg-muted"> · about {location.accuracyM} m accuracy</span>}
          <span className="text-fg-muted"> · {location.source === 'gps' ? 'GPS' : 'entered by you'}</span>
          {location.address && <span> · {location.address}</span>}
          <br />
          <a href={`https://www.openstreetmap.org/?mlat=${p[1]}&mlon=${p[0]}#map=17/${p[1]}/${p[0]}`} target="_blank" rel="noopener noreferrer" className="text-link underline">
            Open in a map
          </a>
        </p>
      ) : (
        <p className="text-sm text-fg-muted">{mode === 'gps' ? 'Waiting for GPS. Allow location access when your browser asks.' : 'GPS is not available. Enter where you are below.'}</p>
      )}

      {mode === 'gps' ? (
        <button type="button" onClick={() => setMode('manual')} className="mt-3 text-xs text-link underline">
          Enter location manually
        </button>
      ) : (
        <form onSubmit={saveManual} className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Enter your location">
          <label className="text-xs text-fg-muted">
            Latitude
            <input inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="18.5204" className="mt-1 w-full rounded-lg border border-line bg-surface-strong px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="text-xs text-fg-muted">
            Longitude
            <input inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="73.8567" className="mt-1 w-full rounded-lg border border-line bg-surface-strong px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="text-xs text-fg-muted sm:col-span-2">
            Landmark or address (optional)
            <input value={form.address} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-surface-strong px-2 py-1.5 text-sm text-fg" />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" size="sm" loading={saving}>
              Share this location
            </Button>
            {globalThis.navigator?.geolocation && (
              <button type="button" onClick={() => setMode('gps')} className="text-xs text-link underline">
                Try GPS again
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </Card>
  )
}
