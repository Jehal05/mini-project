import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet'
import { CONDITIONS, HOSPITAL } from '../data/seed.js'
import { useHospital } from '../sim/HospitalContext.jsx'
import { etaMinutes } from '../utils/geo.js'
import { patientLevel } from '../utils/vitals.js'
import { AMB_STATUS, LEVEL, PATIENT_STATUS } from '../utils/ui.js'

const hospitalIcon = L.divIcon({ className: 'map-emoji', html: '🏥', iconSize: [28, 28], iconAnchor: [14, 14] })

const ambulanceIcons = {}
function ambulanceIcon(id, busy) {
  const key = `${id}-${busy}`
  ambulanceIcons[key] ??= L.divIcon({
    className: 'map-ambulance',
    html: `<span class="${busy ? 'busy' : ''}">🚑</span><b>${id}</b>`,
    iconSize: [70, 24],
    iconAnchor: [12, 12],
  })
  return ambulanceIcons[key]
}

export default function LiveMap({ height = 360 }) {
  const { state } = useHospital()
  const visiblePatients = state.patients.filter((p) => p.status === 'monitoring' || p.status === 'emergency')

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200" style={{ height }}>
      <MapContainer center={[18.535, 73.86]} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[HOSPITAL.lat, HOSPITAL.lng]} icon={hospitalIcon}>
          <Popup>
            <b>{HOSPITAL.name}</b>
            <br />
            {HOSPITAL.area}
          </Popup>
        </Marker>

        {visiblePatients.map((p) => {
          const level = patientLevel(p.vitals)
          const emergency = p.status === 'emergency'
          return (
            <CircleMarker
              key={p.id}
              center={[p.pos.lat, p.pos.lng]}
              radius={emergency ? 12 : 8}
              pathOptions={{ color: LEVEL[level].color, fillColor: LEVEL[level].color, fillOpacity: 0.6, weight: 2 }}
            >
              <Popup>
                <b>{p.name}</b> ({p.id})
                <br />
                {p.area} · {PATIENT_STATUS[p.status].label}
                {p.emergency && (
                  <>
                    <br />
                    <b style={{ color: '#dc2626' }}>{CONDITIONS[p.emergency.condition].label}</b>
                  </>
                )}
                <br />
                HR {Math.round(p.vitals.hr)} bpm · SpO₂ {Math.round(p.vitals.spo2)}%
              </Popup>
            </CircleMarker>
          )
        })}

        {state.ambulances.map((a) => (
          <Marker key={a.id} position={[a.pos.lat, a.pos.lng]} icon={ambulanceIcon(a.id, a.status !== 'available')}>
            <Popup>
              <b>{a.id}</b> · {AMB_STATUS[a.status].label}
              <br />
              Crew: {a.crew}
              {a.leg && (
                <>
                  <br />
                  ETA ~{etaMinutes(a.leg)} min
                </>
              )}
            </Popup>
          </Marker>
        ))}

        {state.ambulances
          .filter((a) => a.leg)
          .map((a) => (
            <Polyline
              key={`route-${a.id}`}
              positions={[
                [a.pos.lat, a.pos.lng],
                [a.leg.to.lat, a.leg.to.lng],
              ]}
              pathOptions={{ color: a.status === 'transporting' ? '#ea580c' : '#dc2626', dashArray: '6 6', weight: 3 }}
            />
          ))}
      </MapContainer>
    </div>
  )
}
