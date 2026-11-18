import { ACTIVE_ALERT_STATUSES } from '../sim/engine.js'
import { useHospital } from '../sim/HospitalContext.jsx'

export default function StatCards() {
  const { state } = useHospital()
  const active = state.alerts.filter((a) => ACTIVE_ALERT_STATUSES.includes(a.status)).length
  const freeAmb = state.ambulances.filter((a) => a.status === 'available').length
  const icu = state.beds.icu
  const admitted = state.patients.filter((p) => p.status === 'admitted').length

  const cards = [
    { label: 'Active emergencies', value: active, tone: active ? 'text-red-600' : 'text-slate-900' },
    { label: 'Patients monitored', value: state.patients.length, sub: `${admitted} admitted` },
    { label: 'Ambulances free', value: `${freeAmb}/${state.ambulances.length}` },
    { label: 'ICU beds free', value: icu.total - icu.occupied, sub: `of ${icu.total}` },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${c.tone ?? 'text-slate-900'}`}>{c.value}</div>
          {c.sub && <div className="text-xs text-slate-500">{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}
