import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { adminFetch } from '../lib/adminApi.js';
import Button from '../ui/Button.jsx';
import { Card, StatTile } from '../ui/Surface.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';

import { boundsOf } from './adminView.js';

const REFRESH_MS = 15000;
const AMB_COLOR = { available: '#15803d', dispatched: '#b45309', on_trip: '#b45309', maintenance: '#6b7280' };
const hospitalIcon = () => L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="ht-marker" style="width:26px;height:26px;background:#0f766e;color:#fff;font:700 13px/26px system-ui;text-align:center" aria-label="Hospital">H</div>` });

function Fit({ points }) {
  const map = useMap();
  useEffect(() => { if (points) map.fitBounds(points, { padding: [40, 40], maxZoom: 13 }); }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// The central admin's overview: hospitals, ambulances and live emergencies on one map. Refreshes by itself.
export default function CommandMap({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setData(await adminFetch(token, '/admin/overview')); setError(''); } catch (e) { setError(e.message); } }, [token]);
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, [load]);
  const pts = useMemo(() => (data ? boundsOf(data) : null), [data?.hospitals?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <ErrorState title="Could not load the map data" onRetry={load}>{error}</ErrorState>;
  if (!data) return <Skeleton className="h-96" />;
  const free = data.ambulances.filter((a) => a.status === 'available').length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Hospitals" value={data.hospitals.length} />
        <StatTile label="Ambulances free" value={free} note={`of ${data.ambulances.length}`} />
        <StatTile label="Live emergencies" value={data.cases.length} tone={data.cases.length ? 'critical' : 'neutral'} />
        <div className="flex items-center"><Button variant="secondary" icon="refresh" onClick={load}>Refresh now</Button></div>
      </div>
      <Card className="h-[28rem] overflow-hidden p-0">
        <MapContainer center={[18.5204, 73.8567]} zoom={11} className="h-full w-full">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Fit points={pts} />
          {data.hospitals.map((h) => (
            <Marker key={h.id} position={[h.location.latitude, h.location.longitude]} icon={hospitalIcon()}>
              <Popup><strong>{h.name}</strong><br />{h.freeBeds} free beds<br />{h.cathLab ? 'Cath lab' : 'No cath lab'}</Popup>
            </Marker>
          ))}
          {data.ambulances.map((a) => (
            <CircleMarker key={a.id} center={[a.location.latitude, a.location.longitude]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: AMB_COLOR[a.status] ?? '#6b7280', fillOpacity: 1 }}>
              <Popup><strong>{a.vehicleNumber}</strong><br />{a.type}, {String(a.status).replace('_', ' ')}</Popup>
            </CircleMarker>
          ))}
          {data.cases.map((c) => (
            <CircleMarker key={c.id} center={[c.location.latitude, c.location.longitude]} radius={11} pathOptions={{ color: '#b91c1c', weight: 3, fillColor: '#ef4444', fillOpacity: 0.6 }}>
              <Popup><strong>Emergency {c.caseNumber ?? ''}</strong><br />{String(c.status).replace(/_/g, ' ')}, {c.severity}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </Card>
      <ul className="flex flex-wrap gap-4 text-sm text-muted" aria-label="Map key">
        <li>Teal H: hospital</li><li>Green dot: ambulance free</li><li>Amber dot: ambulance busy</li><li>Grey dot: out of service</li><li>Red ring: live emergency</li>
      </ul>
      {error && <p className="text-sm text-critical">Last refresh failed: {error}</p>}
    </div>
  );
}
