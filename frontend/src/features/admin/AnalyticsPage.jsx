import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLoad } from '../shared/useLoad.js'
import { adminOps } from './OpsApi.js'

const STAGE_LABEL = { alertToAccept: 'Alert to hospital acceptance', acceptToDispatch: 'Acceptance to ambulance dispatch', alertToCathLab: 'Alert to cath lab team (target 30 min)', sceneTime: 'Ambulance scene time (target 10 min)', pickupToHospital: 'Pickup to hospital arrival' }
const mins = (ms) => (ms == null ? '—' : `${(ms / 60000).toFixed(1)} min`)

/** Feature 96: cases per day, stage times against the golden-hour targets, acceptance rate per hospital, false-alarm rate. */
export default function AnalyticsPage() {
  const [days, setDays] = useState(14)
  const a = useLoad(() => adminOps.analytics(days), [days])
  const d = a.data
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="an-h">
        <h2 id="an-h">Emergency analytics</h2>
        <p className="hint">Simulated data for demonstration. Not a medical device.</p>
        <label htmlFor="days">Period</label>
        <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30, 90].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select>
        {a.error && <p className="form-error" role="alert">{a.error}</p>}
      </section>
      {d && (
        <>
          <div className="tiles">
            <div className="tile"><p className="tile-value">{d.total}</p><p className="tile-label">Cases</p></div>
            <div className="tile"><p className="tile-value">{d.falseAlarm.ratePercent}%</p><p className="tile-label">False-alarm rate ({d.falseAlarm.count} of {d.total})</p></div>
          </div>
          <section className="glass-card" aria-labelledby="pd-h">
            <h2 id="pd-h">Cases per day</h2>
            <div style={{ width: '100%', height: 240 }} role="img" aria-label={`Bar chart of cases per day, ${d.total} in total`}>
              <ResponsiveContainer><BarChart data={d.perDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Cases" fill="var(--primary)" /></BarChart></ResponsiveContainer>
            </div>
            <table className="table"><caption className="sr-only">Cases per day</caption><thead><tr><th scope="col">Date</th><th scope="col">Cases</th></tr></thead><tbody>{d.perDay.map((r) => <tr key={r.date}><td>{r.date}</td><td>{r.count}</td></tr>)}</tbody></table>
          </section>
          <section className="glass-card" aria-labelledby="st-h">
            <h2 id="st-h">Time for each stage</h2>
            <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Stage</th><th scope="col">Cases measured</th><th scope="col">Median</th><th scope="col">Over target</th></tr></thead>
              <tbody>{Object.entries(d.stages).map(([k, s]) => <tr key={k}><th scope="row">{STAGE_LABEL[k]}</th><td>{s.samples}</td><td>{mins(s.medianMs)}</td><td>{s.overTarget == null ? '—' : `${s.overTarget} of ${s.samples}`}</td></tr>)}</tbody></table></div>
          </section>
          <section className="glass-card" aria-labelledby="ac-h">
            <h2 id="ac-h">Acceptance rate per hospital</h2>
            {d.acceptance.length === 0 ? <p className="hint">No hospital was notified in this period.</p> : (
              <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Hospital</th><th scope="col">Notified</th><th scope="col">Accepted</th><th scope="col">Rejected</th><th scope="col">Rate</th></tr></thead>
                <tbody>{d.acceptance.map((r) => <tr key={r.hospital}><th scope="row">{r.hospital}</th><td>{r.notified}</td><td>{r.accepted}</td><td>{r.rejected}</td><td>{r.rate}%</td></tr>)}</tbody></table></div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
