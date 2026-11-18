// Feature 55: the hospital map - patient pin (click/drag in manual mode), radius and accuracy circles, hospital markers and popups.
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import { patientIcon, hospitalIcon, CAPABILITY_COLORS } from '../lib/mapIcons.js';
import { formatKm, toLatLng } from '../utils/distance.js';

const PUNE_CENTER = [18.5204, 73.8567];

// Clicking the map places the patient pin, but only in manual mode.
function ClickToPlace({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick({ lat: e.latlng.lat, lng: e.latlng.lng }, 'click');
    },
  });
  return null;
}

// Fits the patient and all hospitals in view whenever fitNonce changes.
function FitToMarkers({ patient, hospitals, fitNonce }) {
  const map = useMap();
  useEffect(() => {
    if (!patient || fitNonce === 0) return;
    const points = [[patient.lat, patient.lng], ...hospitals.map(toLatLng)];
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14 });
    }
    // Only refit on purpose (new GPS/demo location, radius or filter change), not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);
  return null;
}

// Flies to the focused hospital and opens its popup once the map stops moving.
function FlyToHospital({ focus, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return undefined;
    const openPopup = () => markerRefs.current[focus.id]?.openPopup();
    map.once('moveend', openPopup);
    map.flyTo(focus.latlng, 15, { duration: 0.8 });
    return () => map.off('moveend', openPopup);
  }, [focus, map, markerRefs]);
  return null;
}

function Yes({ value }) {
  return value ? <span className="text-good">Yes</span> : <span className="text-text-muted">No</span>;
}

function HospitalPopup({ hospital }) {
  const c = hospital.capabilities || {};
  return (
    <div className="min-w-[200px] text-[13px] leading-5">
      <p className="text-sm font-semibold text-text">{hospital.name}</p>
      <p className="mb-2 text-text-muted">{hospital.address}</p>
      {hospital.distanceKm !== undefined && (
        <p className="mb-2 font-mono text-primary">{formatKm(hospital.distanceKm)} away</p>
      )}
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
        <dt className="text-text-muted">Cath lab</dt>
        <dd><Yes value={c.cathLab} /></dd>
        <dt className="text-text-muted">Cardiologist on duty</dt>
        <dd><Yes value={c.cardiologistOnDuty} /></dd>
        <dt className="text-text-muted">Free ICU beds</dt>
        <dd>{c.icuBedsFree ?? 0}</dd>
        <dt className="text-text-muted">Free CCU beds</dt>
        <dd className={c.ccuBedsFree === 0 ? 'text-warn' : ''}>{c.ccuBedsFree ?? 0}</dd>
      </dl>
    </div>
  );
}

function Legend() {
  const items = [
    ['You (patient)', '#EF4444'],
    ['Cath lab', CAPABILITY_COLORS.cathLab],
    ['Cardiologist only', CAPABILITY_COLORS.cardiologist],
    ['Neither', CAPABILITY_COLORS.none],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-white/10 bg-ink-950/80 px-3 py-2 text-[11px] backdrop-blur">
      {items.map(([label, color]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function LocationMap({
  patient,
  hospitals,
  radiusKm,
  manualMode,
  onPick,
  focus,
  onSelectHospital,
  fitNonce,
  rankById = {}, // { [hospitalId]: 1 | 2 | 3 } for the cardiac ranking
  fadedIds = null, // Set of not-suitable hospital ids, drawn at 40% opacity
}) {
  const markerRefs = useRef({});

  const patientHandlers = useMemo(
    () => ({
      drag(e) {
        const ll = e.target.getLatLng();
        onPick({ lat: ll.lat, lng: ll.lng }, 'drag');
      },
      dragend(e) {
        const ll = e.target.getLatLng();
        onPick({ lat: ll.lat, lng: ll.lng }, 'dragend');
      },
    }),
    [onPick]
  );

  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl border border-white/10 lg:h-[calc(100vh-170px)]">
      <MapContainer center={PUNE_CENTER} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <ClickToPlace enabled={manualMode} onPick={onPick} />
        <FitToMarkers patient={patient} hospitals={hospitals} fitNonce={fitNonce} />
        <FlyToHospital focus={focus} markerRefs={markerRefs} />

        {patient && (
          <>
            <Circle
              center={[patient.lat, patient.lng]}
              radius={radiusKm * 1000}
              pathOptions={{ color: '#00C2FF', weight: 1.5, dashArray: '6 8', fillOpacity: 0.04 }}
            />
            {patient.source === 'gps' && patient.accuracy && (
              <Circle
                center={[patient.lat, patient.lng]}
                radius={patient.accuracy}
                pathOptions={{ color: '#EF4444', weight: 1, fillOpacity: 0.12 }}
              />
            )}
            <Marker
              position={[patient.lat, patient.lng]}
              icon={patientIcon}
              draggable={manualMode}
              eventHandlers={patientHandlers}
              zIndexOffset={1000}
            >
              <Popup>
                <p className="text-sm font-semibold">Patient location</p>
                <p className="font-mono text-xs text-text-muted">
                  {patient.lat.toFixed(5)}, {patient.lng.toFixed(5)}
                </p>
              </Popup>
            </Marker>
          </>
        )}

        {hospitals.map((h) => (
          <Marker
            key={h._id}
            position={toLatLng(h)}
            icon={hospitalIcon(h, focus?.id === h._id, rankById[h._id] ?? null)}
            opacity={fadedIds?.has(h._id) ? 0.4 : 1}
            zIndexOffset={rankById[h._id] ? 500 - rankById[h._id] : 0}
            ref={(el) => {
              if (el) markerRefs.current[h._id] = el;
              else delete markerRefs.current[h._id];
            }}
            eventHandlers={{ click: () => onSelectHospital(h) }}
          >
            <Popup>
              <HospitalPopup hospital={h} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <Legend />

      {manualMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full border border-primary/40 bg-ink-950/85 px-3 py-1 text-xs text-primary backdrop-blur">
          Click the map to place your pin, then drag it to adjust
        </div>
      )}
    </div>
  );
}
