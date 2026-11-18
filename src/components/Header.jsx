import { HOSPITAL } from '../data/seed.js'
import { useHospital } from '../sim/HospitalContext.jsx'
import { btn } from '../utils/ui.js'

export default function Header({ soundOn, onToggleSound }) {
  const { state, dispatch } = useHospital()
  const waiting = state.alerts.filter((a) => a.status === 'new').length

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">HealthTwin AI · Hospital Portal</h1>
        <p className="text-sm text-slate-500">
          {HOSPITAL.name} · {HOSPITAL.area}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          DEMO · simulated data
        </span>
        {waiting > 0 && (
          <span className="animate-pulse rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
            {waiting} alert{waiting > 1 ? 's' : ''} waiting
          </span>
        )}
        <span className="px-2 text-sm tabular-nums text-slate-600">
          {new Date(state.now).toLocaleTimeString()}
          {!state.running && ' (paused)'}
        </span>
        <button className={btn} onClick={onToggleSound}>
          {soundOn ? '🔔 Sound on' : '🔕 Sound off'}
        </button>
        <button className={btn} onClick={() => dispatch({ type: 'TOGGLE_RUNNING' })}>
          {state.running ? 'Pause' : 'Resume'}
        </button>
        <button className={btn} onClick={() => dispatch({ type: 'RESET', now: Date.now() })}>
          Reset demo
        </button>
      </div>
    </header>
  )
}
