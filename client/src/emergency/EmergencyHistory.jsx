// Feature 50: the patient's own past incidents, each with its full timeline.
import { useEffect, useState } from 'react'
import { Badge, Button, Card } from './kit.jsx'
import { followEmergency } from './socket.js'
import { emergencyApi } from './api.js'
import { CANCEL_LABEL, SOURCE_TEXT, STATUS_TEXT, STATUS_TONE } from './status.js'

const PAGE = 5

export function EmergencyHistory({ patientId, refreshKey }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0) // bumped by this patient's emergency events

  useEffect(() => setPage(1), [patientId])
  // A case that is sent, escalated, cancelled or unresolved changes its row: read the list again.
  useEffect(() => followEmergency(patientId, () => setTick((n) => n + 1)), [patientId])
  useEffect(() => {
    let alive = true
    emergencyApi
      .mine(patientId, { page, limit: PAGE })
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [patientId, page, refreshKey, tick])

  return (
    <Card title="Emergency incidents" subtitle="Your past emergencies · simulated">
      {error && <p className="text-sm text-muted">Incident history is not available right now.</p>}
      {!error && !data && (
        <p className="py-4 text-center text-sm text-muted" role="status">
          Loading…
        </p>
      )}
      {data && data.items.length === 0 && <p className="py-4 text-center text-sm text-muted">No emergency incidents yet.</p>}
      {data && data.items.length > 0 && (
        <ul className="divide-y divide-line">
          {data.items.map((c) => (
            <li key={c.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                  <span>{SOURCE_TEXT[c.source] ?? c.source}</span>
                  <Badge tone={STATUS_TONE[c.status]}>
                    {STATUS_TEXT[c.status]}
                  </Badge>
                  {c.cancellation && <span className="text-muted">{CANCEL_LABEL[c.cancellation.reason]}</span>}
                </summary>
                <ol className="mt-2 space-y-1 pl-2 text-sm">
                  {c.timeline.map((e, i) => (
                    <li key={`${e.type}-${i}`} className="flex gap-3">
                      <span className="font-mono text-xs text-muted">{new Date(e.at).toLocaleTimeString()}</span>
                      <span>{e.message ?? e.type}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      )}
      {data && data.pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </Button>
          <span className="text-muted">
            Page {page} of {data.pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Older
          </Button>
        </div>
      )}
    </Card>
  )
}
