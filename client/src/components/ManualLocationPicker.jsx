import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { geocodeAddress } from '../lib/api.js';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/Form.jsx';
import { Card } from '../ui/Surface.jsx';

const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 }; // Pune, used only to open the map
const REGISTERED_KEY = 'ht.registeredAddress'; // the profile feature (Jehal) will provide the real one

function ClickToPlace({ onPlace }) {
  useMapEvents({ click: (e) => onPlace({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Recenter({ point }) {
  const map = useMap();
  useEffect(() => {
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 14));
  }, [map, point]);
  return null;
}

// Feature 52. Drag or click a pin, search an address, or use the registered address (last fallback).
export default function ManualLocationPicker({ initial, onConfirm, onBack }) {
  const [pin, setPin] = useState(initial || DEFAULT_CENTER);
  const [recenterKey, setRecenterKey] = useState(0);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const registered = typeof localStorage !== 'undefined' ? localStorage.getItem(REGISTERED_KEY) : null;

  async function lookup(text, source) {
    setBusy(true);
    setMessage('');
    try {
      const hit = await geocodeAddress(text);
      if (!hit) setMessage('Address not found. Try adding the area or city.');
      else {
        setPin({ lat: hit.lat, lng: hit.lng });
        setRecenterKey((k) => k + 1);
        setMessage(`Pin moved to: ${hit.label}`);
        if (source === 'registered') setMessage(`Using your registered address: ${hit.label}`);
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto mt-4 max-w-3xl p-4">
      <h2 className="font-title text-xl font-semibold">Choose your location</h2>
      <p className="text-sm text-muted">Click the map or drag the pin, or search for an address.</p>

      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(address, 'search'); }}>
        <Input type="search" aria-label="Search an address or area" placeholder="Search an address or area" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button type="submit" busy={busy}>Search</Button>
      </form>

      {registered && (
        <button type="button" className="mt-2 min-h-touch text-sm font-semibold text-accent underline" onClick={() => lookup(registered, 'registered')}>
          Use my registered address
        </button>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-sm text-muted">{message}</p>

      <div className="mt-3 h-80 overflow-hidden rounded-ui">
        <MapContainer center={[pin.lat, pin.lng]} zoom={13} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPlace={setPin} />
          {recenterKey > 0 && <Recenter key={recenterKey} point={pin} />}
          <Marker
            position={[pin.lat, pin.lng]}
            draggable
            eventHandlers={{ dragend: (e) => setPin({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }) }}
          />
        </MapContainer>
      </div>

      <div className="mt-3 flex justify-between">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={() => onConfirm({ ...pin, source: 'manual' })}>Use this location</Button>
      </div>
    </Card>
  );
}
