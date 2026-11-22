// Patient Portal dashboard (Phase 5): live simulated vitals, ECG strip, history,
// timeline, and the SOS flow (Phase 7: alerts, confirmation and countdown, search, location, first aid, cancel).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VITAL_KEYS } from '@shared/vitals.js'
import { Badge, Card, MedicalBackground, SimulatedBadge, SimulatedNotice, SosButton, VitalTile } from '../design/index.js'
import { PortalNav } from '../components/PortalNav.jsx'
import { monitoringApi } from '../features/monitoring/api.js'
import { useLiveVitals } from '../features/monitoring/useLiveVitals.js'
import { EcgStrip } from '../features/monitoring/EcgStrip.jsx'
import { HealthTimeline } from '../features/monitoring/HealthTimeline.jsx'

// The charting library is the heaviest dependency, so the history card loads after
// the live vitals and ECG are already on screen (review 10).
const HistoryChart = lazy(() => import('../features/monitoring/HistoryChart.jsx').then((m) => ({ default: m.HistoryChart })))

// Detection panels are also loaded after the first screen (they bring their own small chunk).
const DetectionSection = lazy(() => import('../features/detection/index.jsx').then((m) => ({ default: m.DetectionSection })))
const DetectionHistorySection = lazy(() => import('../features/detection/index.jsx').then((m) => ({ default: m.DetectionHistorySection })))

// The SOS flow is its own chunk too (loaded after the first screen; the SOS dialog only when opened).
const EmergencySection = lazy(() => import('../features/emergency/index.jsx').then((m) => ({ default: m.EmergencySection })))
const EmergencyHistorySection = lazy(() => import('../features/emergency/index.jsx').then((m) => ({ default: m.EmergencyHistorySection })))
const SosDialog = lazy(() => import('../features/emergency/index.jsx').then((m) => ({ default: m.SosDialog })))

function DetectionLoading() {
  return (
    <Card title="Emergency detection">
      <p className="py-6 text-center text-sm text-fg-muted" role="status">
        Loading detection…
      </p>
    </Card>
  )
}

function ChartLoading() {
  return (
    <Card title="Health history">
      <p className="h-64 pt-24 text-center text-sm text-fg-muted" role="status">
        Loading charts…
      </p>
    </Card>
  )
}

const SCENARIO_LABEL = { stable: 'Stable', exercise: 'Exercise', fever: 'Fever', hypoxia: 'Hypoxia', cardiac_event: 'Cardiac event' }
const STATUS_TEXT = {
  normal: 'All vitals in the normal range',
  warning: 'One or more vitals in the warning range',
  critical: 'One or more vitals in the critical range',
}

/** One-tap emergency call (tel: link), styled like a danger button. */
function CallLink({ number, label = `Call ${number}` }) {
  return (
    <a
      href={`tel:${number}`}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-critical-solid px-4 text-sm font-semibold text-critical-fg transition hover:brightness-110"
    >
      {label}
    </a>
  )
}

function ageFrom(dob) {
  if (!dob) return null
  const d = new Date(dob)
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a -= 1
  return a
}

export default function PatientDashboard() {
  const { code = 'HT-2026-0001' } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [patients, setPatients] = useState([])
  const [error, setError] = useState(null)
  const [sosOpen, setSosOpen] = useState(false)
  const [emergencyKey, setEmergencyKey] = useState(0) // bumped when SOS is sent, so the live flow reloads at once

  useEffect(() => {
    let cancelled = false
    setPatient(null)
    setError(null)
    monitoringApi
      .getPatient(code)
      .then((p) => !cancelled && setPatient(p))
      .catch((e) => !cancelled && setError(e.status === 404 ? `No patient with ID ${code}.` : 'Cannot reach the HealthTwin backend. Start it with "npm run dev" in backend/.'))
    monitoringApi.listPatients().then((l) => !cancelled && setPatients(l)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [code])

  const { live: socketLive, connected } = useLiveVitals(patient?.id)
  const live = socketLive ?? patient?.live ?? null
  const status = live?.status ?? 'normal'

  // Refresh the timeline soon after the status or scenario changes (the server logs a
  // status change once it has held for 3 ticks).
  const timelineKey = useMemo(() => `${status}|${live?.scenario}`, [status, live?.scenario])
  const [refreshKey, setRefreshKey] = useState(timelineKey)
  useEffect(() => {
    const t = setTimeout(() => setRefreshKey(timelineKey), 7000)
    return () => clearTimeout(t)
  }, [timelineKey])

  const age = ageFrom(patient?.dateOfBirth)
  const cardiac = patient?.cardiacConditions?.map((c) => `${c.type}${c.year ? ` (${c.year})` : ''}`).join(', ')

  return (
    <MedicalBackground portal="patient">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <a
          href="#sos-button"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('sos-button')?.focus()
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-critical-solid focus:px-4 focus:py-2 focus:font-semibold focus:text-critical-fg"
        >
          Skip to the SOS button
        </a>
        <PortalNav connected={patient ? connected : undefined} />

        {error && (
          <Card status="warning" className="mt-6">
            <p className="text-sm">{error}</p>
          </Card>
        )}

        {patient && (
          <>
            <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold sm:text-3xl">{patient.name}</h1>
                  <Badge tone={status}>{status[0].toUpperCase() + status.slice(1)}</Badge>
                  <SimulatedBadge />
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  <span className="font-mono text-fg">{patient.patientCode}</span>
                  {age !== null && ` · ${age} years`}
                  {patient.city && ` · ${patient.city}`}
                  {cardiac && ` · Cardiac history: ${cardiac}`}
                </p>
                <p className="mt-1 text-sm text-fg-muted" role="status" aria-live="polite">
                  {STATUS_TEXT[status]}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {patients.length > 1 && (
                  <label className="text-xs text-fg-muted">
                    <span className="sr-only">Switch demo patient</span>
                    <select
                      value={patient.patientCode}
                      onChange={(e) => navigate(`/patient/${e.target.value}`)}
                      className="rounded-lg border border-line bg-surface-strong px-2 py-1.5 text-sm text-fg"
                    >
                      {patients.map((p) => (
                        <option key={p.id} value={p.patientCode}>
                          {p.name} ({p.patientCode})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="rounded-2xl border border-line bg-surface px-4 py-2 text-center backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wide text-fg-muted">Blood group</p>
                  <p className="font-mono text-2xl font-bold">{patient.bloodGroup ?? '—'}</p>
                </div>
              </div>
            </header>

            <SimulatedNotice className="mt-4" />

            <Suspense fallback={null}>
              <EmergencySection patientId={patient.id} refreshKey={emergencyKey} />
            </Suspense>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <section aria-label="Live vitals" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {VITAL_KEYS.map((k) => (
                    <VitalTile key={k} vital={k} value={live?.vitals?.[k]} />
                  ))}
                </section>

                <Suspense fallback={<DetectionLoading />}>
                  <DetectionSection patientId={patient.id} />
                </Suspense>

                <Card
                  title="ECG"
                  subtitle="Synthetic waveform at the live heart rate · display only"
                  action={
                    <span className="font-mono text-sm text-fg">
                      {live?.vitals?.hr ?? '--'} <span className="text-fg-muted">BPM</span>
                    </span>
                  }
                >
                  <EcgStrip bpm={live?.vitals?.hr ?? 70} status={live?.statuses?.hr ?? 'normal'} />
                </Card>

                <Suspense fallback={<ChartLoading />}>
                  <HistoryChart patientId={patient.id} live={socketLive} />
                </Suspense>
              </div>

              <div className="space-y-6">
                <Card title="Emergency" status="critical">
                  <div className="flex flex-col items-center gap-4 py-2 text-center">
                    <SosButton id="sos-button" onClick={() => setSosOpen(true)} />
                    <p className="text-sm text-fg-muted">Press if you feel unwell. You will be asked to confirm. Serious warnings also alert you automatically.</p>
                    <div className="flex gap-2">
                      <CallLink number="112" />
                      <CallLink number="108" />
                    </div>
                  </div>
                </Card>

                <Card title="Monitoring">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-muted">Connection</dt>
                      <dd>{connected ? 'Live (every 2 s)' : 'Reconnecting…'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-muted">Last update</dt>
                      <dd className="font-mono">{live?.at ? new Date(live.at).toLocaleTimeString() : '--'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-muted">Demo scenario</dt>
                      <dd>
                        <Badge tone={live?.scenario === 'stable' ? 'neutral' : 'accent'} dot={false}>
                          {SCENARIO_LABEL[live?.scenario] ?? '--'}
                        </Badge>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-muted">Saved to history</dt>
                      <dd>every 30 s</dd>
                    </div>
                  </dl>
                </Card>
              </div>
            </div>

            <div className="mt-6">
              <HealthTimeline patientId={patient.id} refreshKey={refreshKey} />
            </div>

            <div className="mt-6">
              <Suspense fallback={null}>
                <DetectionHistorySection patientId={patient.id} refreshKey={refreshKey} />
              </Suspense>
            </div>

            <div className="mt-6">
              <Suspense fallback={null}>
                <EmergencyHistorySection patientId={patient.id} refreshKey={`${refreshKey}|${emergencyKey}`} />
              </Suspense>
            </div>
          </>
        )}

        <footer className="mt-10 border-t border-line pt-4 text-xs text-fg-muted">
          Fictional patient. Simulated data for demonstration. Not a medical device. In an emergency call 112.
        </footer>
      </div>

      {sosOpen && patient && (
        <Suspense fallback={null}>
          <SosDialog open={sosOpen} onClose={() => setSosOpen(false)} patientId={patient.id} onSent={() => setEmergencyKey((k) => k + 1)} />
        </Suspense>
      )}
    </MedicalBackground>
  )
}
