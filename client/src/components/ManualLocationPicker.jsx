import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { geocodeAddress } from '../lib/api.js';

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
    <div className="mx-auto mt-6 max-w-3xl rounded-lg bg-white p-4 shadow">
      <h2 className="text-lg font-bold">Choose your location</h2>
      <p className="text-sm text-slate-600">Click the map or drag the pin, or search for an address.</p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); lookup(address, 'search'); }}
      >
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="Search an address or area"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50" disabled={busy}>Search</button>
      </form>

      {registered && (
        <button className="mt-2 text-sm text-blue-700 underline" onClick={() => lookup(registered, 'registered')}>
          Use my registered address
        </button>
      )}
      {message && <p className="mt-2 text-sm text-slate-700">{message}</p>}

      <div className="mt-3 h-80 overflow-hidden rounded">
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
        <button className="rounded border px-4 py-2" onClick={onBack}>Back</button>
        <button
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white"
          onClick={() => onConfirm({ ...pin, source: 'manual' })}
        >
          Use this location
        </button>
      </div>
    </div>
  );
}
