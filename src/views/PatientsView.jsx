import { useState } from 'react'
import Card from '../components/Card.jsx'
import VitalsChart from '../components/VitalsChart.jsx'
import { CONDITIONS } from '../data/seed.js'
import { useHospital } from '../sim/HospitalContext.jsx'
import { VITALS, fmtVital, patientLevel, vitalLevel } from '../utils/vitals.js'
import { LEVEL, PATIENT_STATUS, btn, btnPrimary } from '../utils/ui.js'

function VitalTile({ k, value }) {
  const level = vitalLevel(k, value)
  return (
    <div className={`rounded-lg border p-3 ${level === 'normal' ? 'border-slate-200' : 'border-current'} ${LEVEL[level].text}`}>
      <div className="text-xs font-medium text-slate-500">{VITALS[k].label}</div>
      <div className="text-2xl font-bold tabular-nums">
        {fmtVital(k, value)} <span className="text-xs font-normal text-slate-500">{VITALS[k].unit}</span>
      </div>
    </div>
  )
}

export default function PatientsView({ selectedId, onSelect }) {
  const { state, dispatch } = useHospital()
  const [condition, setCondition] = useState('heart-attack')
  const patient = state.patients.find((p) => p.id === selectedId) ?? state.patients[0]
  const level = patientLevel(patient.vitals)

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <Card title="Patients" className="lg:col-span-1">
        <ul className="flex flex-col gap-1">
          {state.patients.map((p) => {
            const l = patientLevel(p.vitals)
            return (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                    p.id === patient.id ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEVEL[l].color }} />
                  <span className="flex-1">
                    <span className="block font-medium text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">{PATIENT_STATUS[p.status].label}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-3">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{patient.name}</h2>
              <p className="text-sm text-slate-500">
                {patient.id} · {patient.age} yrs · {patient.gender} · Blood {patient.blood} · {patient.area}
              </p>
              <p className="mt-1 text-sm text-slate-600">History: {patient.history.join(', ')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PATIENT_STATUS[patient.status].cls}`}>
                {PATIENT_STATUS[patient.status].label}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${LEVEL[level].cls}`}>
                Vitals: {LEVEL[level].label}
              </span>
              {patient.emergency && (
                <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  {CONDITIONS[patient.emergency.condition].label}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.keys(VITALS).map((k) => (
              <VitalTile key={k} k={k} value={patient.vitals[k]} />
            ))}
          </div>
        </Card>

        <Card title="Live heart rate and SpO₂ (last 60 s)">
          <VitalsChart history={patient.history} />
        </Card>

        <Card title="Demo controls">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              {Object.entries(CONDITIONS).map(([key, c]) => (
                <option key={key} value={key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              className={btnPrimary}
              disabled={patient.status !== 'monitoring'}
              onClick={() =>
                dispatch({ type: 'TRIGGER_EMERGENCY', patientId: patient.id, condition, now: Date.now() })
              }
            >
              Simulate emergency SOS
            </button>
            <button
              className={btn}
              disabled={patient.status !== 'admitted'}
              onClick={() => dispatch({ type: 'DISCHARGE', patientId: patient.id, now: Date.now() })}
            >
              Discharge patient
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            This stands in for an SOS from the HealthTwin patient app. Emergencies can only start while a patient is on
            home monitoring.
          </p>
        </Card>
      </div>
    </div>
  )
}
