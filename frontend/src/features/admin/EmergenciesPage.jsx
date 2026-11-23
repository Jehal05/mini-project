import { useEffect } from 'react'
import { useLoad } from '../shared/useLoad.js'
import GoldenHour from '../response/GoldenHour.jsx'
import { useSocketEvents } from '../response/hooks.js'
import '../response/response.css'
import { adminOps } from './OpsApi.js'

const SEV = { 3: ['Level 3 critical', 'red'], 2: ['Level 2 urgent', 'amber'], 1: ['Level 1 watch', 'amber'] }

/** Feature 95: every live emergency across hospitals, most urgent first. */
export default function EmergenciesPage() {
  const q = useLoad(() => adminOps.queue(), [])
  useEffect(() => { const t = setInterval(q.reload, 5000); return () => clearInterval(t) }, [q.reload])
  useSocketEvents({ 'emergency:unresolved': q.reload, 'emergency:accepted': q.reload, 'ambulance:status': q.reload })
  const offset = q.data ? new Date(q.data.serverNow).getTime() - Date.now() : 0
  return (
    <section className="glass-card" aria-labelledby="eq-h">
      <h2 id="eq-h">Live emergencies</h2>
      <p className="hint">Simulated data for demonstration. Ranked by severity, risk score, waiting time and distance.</p>
      {q.error && <p className="form-error" role="alert">{q.error}</p>}
      {q.data?.items.length === 0 && <p className="hint">No live emergencies.</p>}
      <ul className="queue">
        {q.data?.items.map((c) => {
          const [label, pill] = SEV[c.severity] ?? SEV[1]
          return (
            <li key={c.id} className={`queue-item queue-${c.severity === 3 ? 'critical' : 'urgent'}`}>
              <div className="queue-head">
                <span><strong>{c.caseNumber ?? c.id.slice(-6)}</strong> · <span className="mono">{c.patientCode}</span> <span className={`pill pill-${pill}`}>{label}</span> <span className="pill">{c.status.replace(/_/g, ' ')}</span></span>
                <span>Risk {c.riskScore}/100 · waiting {Math.round(c.waitingMs / 60000)} min</span>
              </div>
              <p className="hint">{c.hospital ? `Accepted by ${c.hospital}` : `${c.hospitalsTold} hospital(s) told, none accepted`}</p>
              <GoldenHour stages={c.goldenHour} serverOffsetMs={offset} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
