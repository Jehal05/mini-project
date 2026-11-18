import { CONDITIONS } from '../data/seed.js'
import { ACTIVE_ALERT_STATUSES } from '../sim/engine.js'
import { useHospital } from '../sim/HospitalContext.jsx'
import { etaMinutes } from '../utils/geo.js'
import { ALERT_STATUS, ALERT_STEPS, PRIORITY, agoText, btn, btnPrimary } from '../utils/ui.js'
import Card from './Card.jsx'

function sortAlerts(a, b) {
  const isNew = (x) => (x.status === 'new' ? 0 : 1)
  const isCrit = (x) => (x.priority === 'critical' ? 0 : 1)
  return isNew(a) - isNew(b) || isCrit(a) - isCrit(b) || b.createdTick - a.createdTick
}

export default function AlertsPanel({ onOpenPatient }) {
  const { state, dispatch } = useHospital()
  const alerts = state.alerts.filter((a) => ACTIVE_ALERT_STATUSES.includes(a.status)).sort(sortAlerts)
  const freeAmb = state.ambulances.some((a) => a.status === 'available')

  return (
    <Card title="Incoming emergency alerts" action={<span className="text-xs text-slate-500">{alerts.length} active</span>}>
      {alerts.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          No active emergencies. All patients are being monitored.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => {
            const p = state.patients.find((x) => x.id === alert.patientId)
            const amb = state.ambulances.find((x) => x.id === alert.ambulanceId)
            const eta = amb && etaMinutes(amb.leg)
            const step = ALERT_STEPS.indexOf(alert.status)
            return (
              <li
                key={alert.id}
                className={`rounded-lg border p-4 ${
                  alert.status === 'new' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${PRIORITY[alert.priority]}`}>
                        {alert.priority}
                      </span>
                      <span className="font-semibold text-slate-900">{CONDITIONS[alert.condition].label}</span>
                      <span className="text-xs text-slate-500">{alert.id}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      <button className="font-medium underline-offset-2 hover:underline" onClick={() => onOpenPatient?.(p.id)}>
                        {p.name}
                      </button>
                      , {p.age} · {p.blood} · {p.area} · {p.history.join(', ')}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {alert.source} · {agoText(state.tick - alert.createdTick)}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium text-slate-800">{ALERT_STATUS[alert.status]}</div>
                    {amb && (
                      <div className="text-xs text-slate-500">
                        {amb.id}
                        {eta ? ` · ETA ~${eta} min` : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-1" aria-label="Progress">
                  {ALERT_STEPS.slice(1).map((s, i) => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  ))}
                </div>

                {alert.status === 'new' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className={btnPrimary}
                      disabled={!freeAmb}
                      onClick={() => dispatch({ type: 'DISPATCH', alertId: alert.id, now: Date.now() })}
                    >
                      Accept & dispatch nearest ambulance
                    </button>
                    <button
                      className={btn}
                      onClick={() => dispatch({ type: 'DISMISS', alertId: alert.id, now: Date.now() })}
                    >
                      Dismiss (false alarm)
                    </button>
                    {!freeAmb && <span className="text-xs text-amber-700">No ambulance free right now</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
