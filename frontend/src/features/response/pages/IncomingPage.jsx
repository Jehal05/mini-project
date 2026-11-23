import { Link, useOutletContext } from 'react-router-dom'
import GoldenHour from '../GoldenHour.jsx'
import { clock, useNow } from '../hooks.js'

const SEV = { 3: ['critical', 'Level 3 critical', 'red'], 2: ['urgent', 'Level 2 urgent', 'amber'], 1: ['watch', 'Level 1 watch', 'amber'] }

/** Features 62, 64, 95: the live queue, most urgent first, with a response countdown on each case. */
export default function IncomingPage() {
  const { incoming } = useOutletContext()
  const now = useNow(1000) + incoming.offsetMs
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="inc-h">
        <h2 id="inc-h">Incoming emergencies</h2>
        <p className="hint">Simulated data for demonstration. Not a medical device. Most urgent first: severity, risk score, waiting time, distance.</p>
        {incoming.error && <p className="form-error" role="alert">{incoming.error}</p>}
        {!incoming.loading && incoming.items.length === 0 && <p className="hint">No emergencies for this hospital right now.</p>}
        <ul className="queue">
          {incoming.items.map((c) => {
            const [cls, label, pill] = SEV[c.severity] ?? SEV[1]
            const left = c.respondBy ? new Date(c.respondBy).getTime() - now : null
            return (
              <li key={c.id} className={`queue-item queue-${cls}`}>
                <div className="queue-head">
                  <span><strong>{c.caseNumber ?? c.id.slice(-6)}</strong> · <span className="mono">{c.patientCode}</span> <span className={`pill pill-${pill}`}>{label}</span></span>
                  <span>Risk {c.riskScore}/100 · {c.distanceKm} km</span>
                </div>
                {c.vitals && <p className="hint">HR {c.vitals.hr} · BP {c.vitals.sys}/{c.vitals.dia} · SpO2 {c.vitals.spo2}% · Temp {c.vitals.temp}</p>}
                {c.needsResponse
                  ? <p className={`countdown${left < 0 ? ' countdown-late' : ''}`} role="timer" aria-live="off">{left > 0 ? `Respond within ${clock(left)}` : 'Response time is over'}</p>
                  : <p className="hint">Status: {c.status.replace(/_/g, ' ')}</p>}
                <GoldenHour stages={c.goldenHour} serverOffsetMs={incoming.offsetMs} />
                <div className="actions"><Link className="btn btn-primary" to={`/hospital/emergencies/${c.id}`}>{c.needsResponse ? 'Review and respond' : 'Open case'}</Link></div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
