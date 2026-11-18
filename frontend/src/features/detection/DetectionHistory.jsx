// Feature 40: the patient's own detection history, newest first, with the readings
// at the time, the rule that fired and the outcome.
import { useEffect, useState } from 'react'
import { Badge, Button, Card, Table } from '../../design/index.js'
import { detectionApi } from './api.js'
import { LEVEL_SHORT, LEVEL_TONE, OUTCOME_TEXT } from './severity.js'

const PAGE_SIZE = 6

export function DetectionHistory({ patientId, refreshKey }) {
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [patientId, severity])

  useEffect(() => {
    if (!patientId) return undefined
    let cancelled = false
    const load = () =>
      detectionApi
        .detections(patientId, { page, limit: PAGE_SIZE, severity: severity || undefined })
        .then((d) => {
          if (!cancelled) {
            setData(d)
            setError(false)
          }
        })
        .catch(() => !cancelled && setError(true))
    load()
    const timer = setInterval(load, 15_000) // new detections also arrive between status changes
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [patientId, page, severity, refreshKey])

  const columns = [
    { key: 'at', header: 'When', mono: true, render: (r) => new Date(r.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
    {
      key: 'severity',
      header: 'Level',
      render: (r) => (
        <Badge tone={LEVEL_TONE[r.severity]} dot={false}>
          {LEVEL_SHORT[r.severity]}
        </Badge>
      ),
    },
    { key: 'why', header: 'What fired', render: (r) => r.rules[0]?.message ?? r.primaryRule },
    { key: 'readings', header: 'Readings', mono: true, render: (r) => `HR ${r.snapshot.hr} · SpO2 ${r.snapshot.spo2}` },
    { key: 'outcome', header: 'Outcome', render: (r) => OUTCOME_TEXT[r.outcome] ?? r.outcome },
  ]

  return (
    <Card
      title="Detection history"
      subtitle="Every detection with the readings at the time · simulated"
      action={
        <label className="text-xs text-fg-muted">
          <span className="sr-only">Filter by level</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg border border-line bg-surface-strong px-2 py-1.5 text-sm text-fg">
            <option value="">All levels</option>
            <option value="1">Watch</option>
            <option value="2">Urgent</option>
            <option value="3">Critical</option>
          </select>
        </label>
      }
      bodyClassName="p-0"
    >
      {error ? (
        <p className="p-5 text-sm">Detection history is not available right now.</p>
      ) : (
        <>
          <Table
            className="rounded-none border-0 bg-transparent"
            caption="Detection history"
            columns={columns}
            rows={data?.items ?? []}
            empty={data ? 'No detections yet.' : 'Loading…'}
          />
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
              <span className="text-fg-muted">
                Page {data.page} of {data.pages} · {data.total} detections
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Newer
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                  Older
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
