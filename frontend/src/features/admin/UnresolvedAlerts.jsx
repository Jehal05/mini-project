import { useEffect, useState } from 'react'
import { makeRequest, API_URL } from '../monitoring/api.js'
import { getSocket } from '../monitoring/useLiveVitals.js'

const request = makeRequest(`${API_URL}/api/emergency`)
const EVENT = 'emergency:unresolved'

/**
 * Cases that no hospital accepted after every search round. The list comes from the server on load and a
 * live event adds new ones, so the central admin sees them without refreshing. Simulated data only.
 */
export default function UnresolvedAlerts() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    let detach = () => {}
    request('/unresolved')
      .then((d) => active && setItems(d.items ?? []))
      .catch((e) => active && setError(e.message))
    getSocket().then((s) => {
      if (!active) return
      const onAlert = (p) => setItems((list) => (list.some((c) => (c.id ?? c.caseId) === p.caseId) ? list : [{ id: p.caseId, patientCode: p.patientCode, caseNumber: p.caseNumber ?? null, location: p.location }, ...list]))
      s.on(EVENT, onAlert)
      detach = () => s.off(EVENT, onAlert)
    })
    return () => { active = false; detach() }
  }, [])

  if (error) return <p className="notice" role="status">Could not load emergency alerts: {error}</p>
  if (items.length === 0) return null
  return (
    <section className="glass-card" role="alert" aria-labelledby="unresolved-h">
      <h2 id="unresolved-h">{items.length} emergency {items.length === 1 ? 'case has' : 'cases have'} no hospital</h2>
      <p className="subtitle">No hospital accepted after three search rounds. The patient has been told to call 112.</p>
      <ul>
        {items.map((c) => (
          <li key={c.id}>
            <span className="mono">{c.caseNumber ?? c.id}</span> · patient <span className="mono">{c.patientCode}</span>
            {c.location?.address ? ` · ${c.location.address}` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
