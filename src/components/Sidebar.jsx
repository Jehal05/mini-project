import { useHospital } from '../sim/HospitalContext.jsx'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'patients', label: 'Patients', icon: '🩺' },
  { id: 'map', label: 'Live map', icon: '🗺️' },
  { id: 'ambulances', label: 'Ambulances', icon: '🚑' },
]

export default function Sidebar({ view, onChange }) {
  const { state } = useHospital()
  const waiting = state.alerts.filter((a) => a.status === 'new').length

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="px-5 py-5">
        <div className="text-lg font-bold text-white">
          HealthTwin <span className="text-red-400">AI</span>
        </div>
        <div className="text-xs text-slate-400">Hospital Portal</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              view === item.id ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.id === 'dashboard' && waiting > 0 && (
              <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">{waiting}</span>
            )}
          </button>
        ))}
      </nav>
      <p className="px-5 py-4 text-xs text-slate-500">Demo build. All patients and data are simulated.</p>
    </aside>
  )
}
