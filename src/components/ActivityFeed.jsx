import { useHospital } from '../sim/HospitalContext.jsx'
import { EVENT_DOT } from '../utils/ui.js'

export default function ActivityFeed({ limit = 8 }) {
  const { state } = useHospital()
  const events = state.events.slice(0, limit)

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No activity yet. Alerts and dispatches show up here.</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_DOT[e.level]}`} />
          <div>
            <div className="text-slate-700">{e.text}</div>
            <div className="text-xs text-slate-400">{new Date(e.at).toLocaleTimeString()}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
