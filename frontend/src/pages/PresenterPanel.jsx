// Feature 26: presenter control panel. Switches a demo patient's scenario on cue,
// e.g. Rahul into "Cardiac event" during the final demo. Demo-only tool: when
// Jehal's auth lands, this page and its endpoint should be limited to central_admin.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VITAL_KEYS, formatVital } from '@shared/vitals.js'
import { Badge, Button, Card, MedicalBackground, SimulatedNotice } from '../design/index.js'
import { PortalNav } from '../components/PortalNav.jsx'
import { monitoringApi } from '../features/monitoring/api.js'

const SHORT = { hr: 'HR', sys: 'SYS', dia: 'DIA', spo2: 'SpO2', temp: 'T', rr: 'RR' }

export default function PresenterPanel() {
  const [patients, setPatients] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const refresh = useCallback(
    () =>
      monitoringApi
        .listPatients()
        .then((list) => {
          setPatients(list)
          setError(null)
        })
        .catch(() => setError('Cannot reach the backend. Start it with "npm run dev" in backend/.')),
    [],
  )

  useEffect(() => {
    monitoringApi.scenarios().then(setScenarios).catch(() => {})
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [refresh])

  async function choose(patient, scenario) {
    setBusy(`${patient.id}:${scenario}`)
    try {
      const snap = await monitoringApi.setScenario(patient.id, scenario)
      setPatients((list) => list.map((p) => (p.id === patient.id ? { ...p, live: snap } : p)))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <MedicalBackground portal="admin">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PortalNav />
        <header className="mt-6">
          <h1 className="text-2xl font-bold">Presenter control panel</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Switch a demo patient's simulated scenario. Vitals glide to the new state over about 30–60 seconds.
          </p>
        </header>
        <SimulatedNotice className="mt-4" />
        {error && (
          <Card status="warning" className="mt-4">
            <p className="text-sm">{error}</p>
          </Card>
        )}

        <div className="mt-6 space-y-4">
          {patients.map((p) => {
            const live = p.live
            return (
              <Card key={p.id} status={live?.status ?? 'info'}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{p.name}</h2>
                      <span className="font-mono text-xs text-fg-muted">{p.patientCode}</span>
                      {live && <Badge tone={live.status} />}
                    </div>
                    <p className="mt-1 font-mono text-xs text-fg-muted" aria-label={`Live vitals for ${p.name}`}>
                      {live
                        ? VITAL_KEYS.map((k) => `${SHORT[k]} ${formatVital(k, live.vitals[k])}`).join(' · ')
                        : 'Not monitored yet'}
                    </p>
                  </div>
                  <Link to={`/patient/${p.patientCode}`} className="text-sm font-medium text-link hover:underline">
                    Open dashboard →
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`Scenario for ${p.name}`}>
                  {scenarios.map((s) => {
                    const active = live?.scenario === s.key
                    return (
                      <Button
                        key={s.key}
                        size="sm"
                        variant={active ? (s.key === 'cardiac_event' ? 'danger' : 'primary') : 'secondary'}
                        aria-pressed={active}
                        loading={busy === `${p.id}:${s.key}`}
                        title={s.description}
                        onClick={() => choose(p, s.key)}
                      >
                        {s.label}
                      </Button>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </MedicalBackground>
  )
}
