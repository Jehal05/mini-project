import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { formatEta } from '../lib/stages.js';

const dot = (color, size) =>
  L.divIcon({ className: '', html: `<div class="ht-marker" style="width:${size}px;height:${size}px;background:${color}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const ll = (c) => [c[1], c[0]];

function Fit({ trip }) {
  const map = useMap();
  const first = trip.legs[0]?.coordinates;
  useEffect(() => {
    const pts = trip.legs.flatMap((l) => l.coordinates.map(ll));
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
  }, [map, first]); // fit once per trip, not on every position update
  return null;
}

// Features 75-77: both route legs (current one highlighted), moving ambulance marker, ETA.
export default function TrackingMap({ trip, height = 'h-72' }) {
  if (!trip?.legs?.length) return null;
  const done = trip.stage === 'at_hospital';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 rounded-ui bg-ink px-3 py-2 text-surface" role="status" aria-live="polite">
        <span className="text-lg font-bold">{done ? 'Arrived' : `Arriving in ${formatEta(trip.etaMinutes)}`}</span>
        {!done && <span className="text-sm opacity-80">{trip.remainingKm} km to {trip.activeLeg === 0 ? 'patient' : 'hospital'}</span>}
        {!done && trip.activeLeg === 0 && <span className="text-sm opacity-80">Hospital in about {formatEta(trip.etaHospitalMinutes)}</span>}
        {trip.legs[trip.activeLeg]?.etaSource === 'estimate' && <span className="text-xs opacity-70">Estimated, straight-line route</span>}
      </div>
      <MapContainer center={ll(trip.legs[0].coordinates[0])} zoom={13} className={`${height} w-full rounded-ui`}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit trip={trip} />
        {trip.legs.map((l, i) => (
          <Polyline
            key={l.name}
            positions={l.coordinates.map(ll)}
            pathOptions={i === trip.activeLeg ? { color: '#dc2626', weight: 6 } : { color: '#94a3b8', weight: 4, dashArray: '6 8' }}
          />
        ))}
        {trip.patientLocation && <Marker position={[trip.patientLocation.lat, trip.patientLocation.lng]} icon={dot('#2563eb', 18)}><Popup>Patient</Popup></Marker>}
        {trip.hospital?.location && <Marker position={[trip.hospital.location.lat, trip.hospital.location.lng]} icon={dot('#16a34a', 18)}><Popup>{trip.hospital.name}</Popup></Marker>}
        {trip.position && (
          <Marker position={[trip.position.lat, trip.position.lng]} icon={dot('#dc2626', 22)}>
            <Popup>{trip.ambulance?.vehicleNumber} ({trip.ambulance?.type})</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
