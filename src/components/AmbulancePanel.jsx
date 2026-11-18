import { useHospital } from '../sim/HospitalContext.jsx'
import { etaMinutes } from '../utils/geo.js'
import { AMB_STATUS } from '../utils/ui.js'

export default function AmbulancePanel({ compact = false }) {
  const { state } = useHospital()

  return (
    <ul className={`grid gap-3 ${compact ? '' : 'md:grid-cols-3'}`}>
      {state.ambulances.map((a) => {
        const alert = state.alerts.find((x) => x.id === a.alertId)
        const patient = alert && state.patients.find((x) => x.id === alert.patientId)
        const eta = etaMinutes(a.leg)
        return (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">🚑 {a.id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${AMB_STATUS[a.status].cls}`}>
                {AMB_STATUS[a.status].label}
              </span>
            </div>
            {!compact && (
              <div className="mt-1 text-xs text-slate-500">
                Crew: {a.crew} · Base: {a.station}
              </div>
            )}
            {patient ? (
              <div className="mt-2 text-sm text-slate-700">
                {a.status === 'transporting' ? 'Carrying' : 'Assigned to'} <b>{patient.name}</b>
                {eta && <span className="text-slate-500"> · ETA ~{eta} min</span>}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">Ready for dispatch</div>
            )}
            {a.leg && (
              <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                <div
                  className={`h-1.5 rounded-full ${a.status === 'transporting' ? 'bg-orange-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.round(a.leg.progress * 100)}%` }}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
