import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { LEVEL_COLORS, LEVEL_LABELS } from '../lib/geo.js';

// A hospital marker carries its rank as a number, so the map does not rely on colour alone.
const dot = (color, size, label = '') =>
  L.divIcon({
    className: '',
    html: `<div class="ht-marker" style="width:${size}px;height:${size}px;background:${color};color:#fff;font:700 ${Math.round(size * 0.55)}px/${size}px system-ui;text-align:center">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

function FitToResults({ origin, results }) {
  const map = useMap();
  useEffect(() => {
    const points = [[origin.lat, origin.lng], ...results.map((r) => [r.location.lat, r.location.lng])];
    map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [map, origin, results]);
  return null;
}

// Feature 55. Patient pin (blue) and hospital markers coloured by capability level, with popups.
export default function HospitalMap({ origin, results, selectedId, onSelect, radiusKm }) {
  return (
    <MapContainer center={[origin.lat, origin.lng]} zoom={13} className="h-full min-h-[24rem] w-full rounded-ui">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToResults origin={origin} results={results} />
      <Circle center={[origin.lat, origin.lng]} radius={radiusKm * 1000} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.04 }} />
      <Marker position={[origin.lat, origin.lng]} icon={dot('#2563eb', 18)}>
        <Popup>Patient location</Popup>
      </Marker>

      {results.map((h) => (
        <Marker
          key={h.id}
          position={[h.location.lat, h.location.lng]}
          icon={dot(LEVEL_COLORS[h.capability.level], h.id === selectedId ? 30 : 24, h.rank ?? '')}
          eventHandlers={{ click: () => onSelect?.(h.id) }}
        >
          <Popup>
            <strong>{h.rank ? `#${h.rank} ` : ''}{h.name}</strong>
            <br />
            {LEVEL_LABELS[h.capability.level]}
            <br />
            {h.distanceKm} km away{h.eta ? `, about ${Math.round(h.eta.durationMin)} min by road` : ''}
            <br />
            Cath lab: {h.capability.cathLab ? 'yes' : 'no'}, CCU beds free: {h.capability.ccuFree}
            {h.notifyFirst && (<><br /><em>Notified first</em></>)}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
