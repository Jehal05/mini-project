import { useHospital } from '../sim/HospitalContext.jsx'

export default function BedsPanel() {
  const { state } = useHospital()

  return (
    <ul className="flex flex-col gap-4">
      {Object.entries(state.beds).map(([key, bed]) => {
        const pct = Math.round((bed.occupied / bed.total) * 100)
        const tone = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
        return (
          <li key={key}>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-700">{bed.label}</span>
              <span className="tabular-nums text-slate-500">
                {bed.total - bed.occupied} free / {bed.total}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-200">
              <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
