import { useHospital } from '../sim/HospitalContext.jsx'
import { fmtVital, patientLevel, vitalLevel } from '../utils/vitals.js'
import { LEVEL, PATIENT_STATUS } from '../utils/ui.js'

function Cell({ k, v }) {
  return <td className={`px-3 py-2 tabular-nums ${LEVEL[vitalLevel(k, v)].text}`}>{fmtVital(k, v)}</td>
}

export default function PatientTable({ onOpenPatient }) {
  const { state } = useHospital()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Patient</th>
            <th className="px-3 py-2">Area</th>
            <th className="px-3 py-2">HR</th>
            <th className="px-3 py-2">SpO₂</th>
            <th className="px-3 py-2">BP</th>
            <th className="px-3 py-2">Glucose</th>
            <th className="px-3 py-2">Vitals</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.patients.map((p) => {
            const level = patientLevel(p.vitals)
            const bpLevel = [vitalLevel('sys', p.vitals.sys), vitalLevel('dia', p.vitals.dia)].includes('critical')
              ? 'critical'
              : [vitalLevel('sys', p.vitals.sys), vitalLevel('dia', p.vitals.dia)].includes('warning')
                ? 'warning'
                : 'normal'
            return (
              <tr
                key={p.id}
                onClick={() => onOpenPatient?.(p.id)}
                className={`cursor-pointer hover:bg-slate-50 ${level === 'critical' ? 'bg-red-50/60' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.id} · {p.age} · {p.gender}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">{p.area}</td>
                <Cell k="hr" v={p.vitals.hr} />
                <Cell k="spo2" v={p.vitals.spo2} />
                <td className={`px-3 py-2 tabular-nums ${LEVEL[bpLevel].text}`}>
                  {fmtVital('sys', p.vitals.sys)}/{fmtVital('dia', p.vitals.dia)}
                </td>
                <Cell k="glucose" v={p.vitals.glucose} />
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL[level].cls}`}>
                    {LEVEL[level].label}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PATIENT_STATUS[p.status].cls}`}>
                    {PATIENT_STATUS[p.status].label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
