// The public front door: a 3D heart, the detection -> connection -> response story, and the four logins.
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MedicalBackground, SimulatedNotice, EcgLine } from '../../design/index.js'
import { HeartView } from '../twin/HeartView.jsx'
import ChambersDiagram from './ChambersDiagram.jsx'

const STORY = [
  { n: 1, title: 'Detection', body: 'Simulated readings are checked every two seconds against configurable rules. A worrying pattern starts a short countdown, so even an unresponsive patient is helped.' },
  { n: 2, title: 'Connection', body: 'The nearest suitable hospitals are ranked by distance, cardiac capability and current load, and the best three are alerted at once. A rejection or silence widens the search.' },
  { n: 3, title: 'Response', body: 'The first hospital to accept wins. An ambulance is sent, the hospital prepares with the patient’s record, and every step is timed against the golden-hour targets.' },
]

const LOGINS = [
  { label: 'Patient', to: '/login' },
  { label: 'Doctor', to: '/login?portal=doctor' },
  { label: 'Hospital staff', to: '/login?portal=staff' },
  { label: 'Admin', to: '/login?portal=admin' },
]

const btn = 'inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition'

export default function LandingPage() {
  const reduce = useReducedMotion()
  const fade = (i) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: i * 0.1, duration: 0.5 } })
  return (
    <MedicalBackground portal="patient">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="flex items-center justify-between">
          <p className="text-lg font-bold">HealthTwin <span className="text-primary">AI</span></p>
          <Link to="/scan" className="text-sm text-fg-muted underline">Scan a QR passport</Link>
        </header>

        <section className="mt-10 grid items-center gap-8 md:grid-cols-2" aria-labelledby="hero-h">
          <div>
            <h1 id="hero-h" className="text-3xl font-bold leading-tight sm:text-4xl">From a worrying heartbeat to a hospital bed, in one connected flow.</h1>
            <p className="mt-4 text-fg-muted">A multi-hospital cardiac emergency response platform. It spots a potential emergency from simulated readings, finds nearby suitable hospitals, and coordinates the response until the patient is admitted. It does not diagnose.</p>
            <nav aria-label="Log in" className="mt-6 flex flex-wrap gap-3">
              {LOGINS.map((l, i) => (
                <Link key={l.label} to={l.to} className={`${btn} ${i === 0 ? 'bg-primary text-primary-fg hover:brightness-110' : 'border border-line bg-surface-strong text-fg hover:bg-surface'}`}>
                  {l.label} login
                </Link>
              ))}
            </nav>
            <p className="mt-3 text-sm text-fg-muted">New patient? <Link to="/register" className="underline">Create an account</Link></p>
          </div>
          <div className="flex justify-center"><HeartView bpm={72} status="normal" /></div>
        </section>

        <EcgLine className="mt-8" />

        <section className="mt-10" aria-labelledby="story-h">
          <h2 id="story-h" className="text-xl font-semibold">How it works</h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {STORY.map((s, i) => (
              <motion.li key={s.n} {...fade(i)} className="rounded-2xl border border-line bg-surface p-5 backdrop-blur-md">
                <span className="font-mono text-sm text-primary">0{s.n}</span>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        <section className="mt-10 grid items-center gap-6 md:grid-cols-2" aria-labelledby="chambers-h">
          <div>
            <h2 id="chambers-h" className="text-xl font-semibold">The heart, simply</h2>
            <p className="mt-2 text-sm text-fg-muted">Four chambers work together. The heart on this page beats at a simulated rate and changes colour with the patient’s status: green, amber or red.</p>
          </div>
          <ChambersDiagram />
        </section>

        <SimulatedNotice className="mt-10" />
        <footer className="mt-6 text-xs text-fg-muted">Demonstration only. All patients, hospitals and readings are fictional. In a real emergency call 112 or 108.</footer>
      </main>
    </MedicalBackground>
  )
}
