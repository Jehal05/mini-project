// Design-system showcase. Teammates can open this page to see every shared
// component in dark and light themes and in all three portal backgrounds.
import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  EcgLine,
  MedicalBackground,
  Modal,
  SimulatedNotice,
  SosButton,
  Table,
  VitalTile,
  useTheme,
} from '../design/index.js'
import { PortalNav } from '../components/PortalNav.jsx'

const TOKENS = [
  ['Primary', 'bg-primary', '#00C2FF', 'Buttons, links, charts'],
  ['Accent', 'bg-accent', '#7C5CFF', '3D lighting, highlights'],
  ['Normal', 'bg-normal', '#22C55E', 'Normal status'],
  ['Warning', 'bg-warning', '#F59E0B', 'Warning status'],
  ['Critical', 'bg-critical', '#EF4444', 'Critical, SOS and takeover only'],
]

const STABLE = { hr: 78, sys: 124, spo2: 98, temp: 36.8, rr: 16 }
const CARDIAC = { hr: 134, sys: 168, spo2: 88, temp: 37.2, rr: 26 }

const PATIENTS = [
  { id: 'HT-2026-0001', name: 'Rahul Sharma', age: 45, blood: 'B+', status: 'critical' },
  { id: 'HT-2026-0002', name: 'Ananya Iyer', age: 25, blood: 'O+', status: 'normal' },
  { id: 'HT-2026-0003', name: 'Vikram Desai', age: 61, blood: 'A−', status: 'warning' },
]

export default function DesignShowcase() {
  const { theme, toggleTheme, motionPaused, toggleMotion } = useTheme()
  const [portal, setPortal] = useState('patient')
  const [alert, setAlert] = useState(false)
  const [cardiac, setCardiac] = useState(false)
  const [modal, setModal] = useState(null)
  const vitals = cardiac ? CARDIAC : STABLE

  return (
    <MedicalBackground portal={portal} alert={alert}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PortalNav />
        <header className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-link">HealthTwin AI</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Design system</h1>
              <p className="mt-1 text-sm text-fg-muted">Feature 102 · shared tokens and components for all three portals</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={toggleTheme}>
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </Button>
              <Button variant="secondary" size="sm" onClick={toggleMotion} aria-pressed={motionPaused}>
                {motionPaused ? 'Resume motion' : 'Pause motion'}
              </Button>
            </div>
          </div>
          <EcgLine className="mt-4" tone={cardiac ? 'critical' : 'primary'} />
        </header>

        <Card title="Portal background" subtitle="Each portal has its own variant of the medical background" className="mt-6">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Portal">
            {['patient', 'hospital', 'admin'].map((p) => (
              <Button key={p} size="sm" variant={portal === p ? 'primary' : 'secondary'} aria-pressed={portal === p} onClick={() => setPortal(p)}>
                {p === 'admin' ? 'Central Admin' : p[0].toUpperCase() + p.slice(1)}
              </Button>
            ))}
            {portal === 'hospital' && (
              <Button size="sm" variant="ghost" aria-pressed={alert} onClick={() => setAlert((a) => !a)}>
                {alert ? 'Clear alert vignette' : 'Show alert vignette'}
              </Button>
            )}
          </div>
        </Card>

        <section className="mt-6" aria-labelledby="tokens">
          <h2 id="tokens" className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Colour tokens (dark-theme values)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TOKENS.map(([name, cls, hex, use]) => (
              <div key={name} className="rounded-2xl border border-line bg-surface p-3 backdrop-blur-xl">
                <div className={`h-10 rounded-lg ${cls}`} />
                <p className="mt-2 text-sm font-semibold">{name}</p>
                <p className="font-mono text-xs text-fg-muted">{hex}</p>
                <p className="mt-1 text-xs text-fg-muted">{use}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8" aria-labelledby="vitals">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="vitals" className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Vital tiles · Rahul Sharma
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setCardiac((c) => !c)}>
              {cardiac ? 'Back to stable' : 'Switch to cardiac scenario'}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {Object.entries(vitals).map(([k, v]) => (
              <VitalTile key={k} vital={k} value={v} />
            ))}
          </div>
          <SimulatedNotice className="mt-3" />
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card title="Buttons">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button loading>Saving</Button>
              <Button variant="danger">Call 112</Button>
            </div>
            <div className="mt-6 flex justify-center">
              <SosButton onClick={() => setModal('sos')} />
            </div>
          </Card>

          <Card title="Badges">
            <div className="flex flex-wrap gap-2">
              <Badge tone="normal" />
              <Badge tone="warning" />
              <Badge tone="critical" />
              <Badge tone="info">Accepted</Badge>
              <Badge tone="accent">Level 1 Watch</Badge>
              <Badge tone="neutral">Closed</Badge>
            </div>
          </Card>

          <Card title="Cards with status edge">
            <div className="space-y-3">
              <Card status="normal" bodyClassName="p-3 text-sm">Stable · no action</Card>
              <Card status="warning" bodyClassName="p-3 text-sm">Level 1 Watch</Card>
              <Card status="critical" bodyClassName="p-3 text-sm">Level 3 Critical cardiac</Card>
            </div>
          </Card>
        </div>

        <section className="mt-8" aria-labelledby="table">
          <h2 id="table" className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Table</h2>
          <Table
            className="mt-3"
            caption="Demo patients"
            rows={PATIENTS}
            onRowClick={() => setModal('info')}
            columns={[
              { key: 'id', header: 'Patient ID', mono: true },
              { key: 'name', header: 'Name' },
              { key: 'age', header: 'Age', align: 'right', mono: true },
              { key: 'blood', header: 'Blood', align: 'center' },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status} /> },
            ]}
          />
        </section>

        <footer className="mt-10 border-t border-line pt-4 text-xs text-fg-muted">
          All patients are fictional. Simulated data for demonstration. Not a medical device.
        </footer>
      </div>

      <Modal
        open={modal === 'sos'}
        onClose={() => setModal(null)}
        tone="critical"
        title="Are you okay?"
        description="Demo of the critical dialog style. The real confirmation screen (feature 43) adds the symptom check and the 10-second countdown."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              I'm okay
            </Button>
            <Button variant="danger" onClick={() => setModal(null)}>
              Send help now
            </Button>
          </>
        }
      >
        <SimulatedNotice />
      </Modal>

      <Modal
        open={modal === 'info'}
        onClose={() => setModal(null)}
        title="Patient row clicked"
        description="Tables support keyboard and click row actions."
        footer={<Button onClick={() => setModal(null)}>Done</Button>}
      />
    </MedicalBackground>
  )
}
