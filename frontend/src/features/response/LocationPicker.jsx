// Feature 52: choose a location without GPS. Search an address, or drag the pin / click the map.
import { useState } from 'react'
import { responseApi } from './api.js'
import MapView from './MapView.jsx'

export default function LocationPicker({ value, onChange, extraPoints = [], lines = [], circles = [], height = 300, label = 'Choose a location on the map' }) {
  const [text, setText] = useState('')
  const [found, setFound] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search(e) {
    e.preventDefault()
    if (text.trim().length < 3) return setError('Type at least 3 letters of an address or area.')
    setBusy(true); setError('')
    try { setFound(await responseApi.geocode(text.trim())) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const points = [...(value ? [{ id: 'me', kind: 'patient', lng: value.lng, lat: value.lat, label: value.label ?? 'You are here' }] : []), ...extraPoints]
  return (
    <div className="stack">
      <form onSubmit={search} role="search" aria-label="Search an address" className="filters">
        <label htmlFor="addr-q">Search an address or area</label>
        <input id="addr-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="for example Kothrud, Pune" maxLength={120} />
        <button type="submit" className="btn btn-secondary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {found && (
        found.items.length ? (
          <ul className="item-list" aria-label="Address results">
            {found.items.map((r) => (
              <li key={`${r.lng},${r.lat}`}><span>{r.label}</span><button type="button" className="btn btn-secondary" onClick={() => { onChange({ lng: r.lng, lat: r.lat, label: r.label }); setFound(null) }}>Use this place</button></li>
            ))}
          </ul>
        ) : <p className="hint" role="status">No place found. Try a nearby area, or drop the pin on the map.</p>
      )}
      <MapView points={points} lines={lines} circles={circles} height={height} label={label} draggablePin onPick={({ lng, lat }) => onChange({ lng, lat, label: 'Dropped pin' })} />
    </div>
  )
}
