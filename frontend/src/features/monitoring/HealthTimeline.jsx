// Feature 30: readings (as a status bar) and events on one time axis.
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card } from '../../design/index.js'
import { cx } from '../../design/cx.js'
import { monitoringApi } from './api.js'
import { RANGES, positionPct, statusSegments } from './chartData.js'

const SEG_CLASS = { normal: 'bg-normal/50', warning: 'bg-warning/70', critical: 'bg-critical/80' }
const DOT_CLASS = {
  info: 'bg-primary',
  normal: 'bg-normal',
  warning: 'bg-warning',
  critical: 'bg-critical',
}
const TYPE_LABEL = {
  monitoring_started: 'Monitoring',
  scenario_change: 'Scenario',
  status_change: 'Status',
  detection: 'Detection',
  sos: 'SOS',
  emergency: 'Emergency',
  admission: 'Admission',
  note: 'Note',
}
const BADGE_TONE = { info: 'info', normal: 'normal', warning: 'warning', critical: 'critical' }

const fmt = (iso, range) =>
  new Date(iso).toLocaleString([], range === '1h' ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' })

export function HealthTimeline({ patientId, refreshKey }) {
  const [range, setRange] = useState('24h')
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!patientId) return undefined
    let cancelled = false
    const load = () =>
      monitoringApi
        .timeline(patientId, range)
        .then((d) => {
          if (!cancelled) {
            setData(d)
            setError(false)
          }
        })
        .catch(() => !cancelled && setError(true))
    load()
    const timer = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [patientId, range, refreshKey])

  const segments = useMemo(() => (data ? statusSegments(data.readings, data.from, data.to) : []), [data])
  const events = data?.events ?? []

  return (
    <Card
      title="Health timeline"
      subtitle="Readings and events on one time axis"
      action={
        <div className="flex gap-1" role="group" aria-label="Timeline range">
          {RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={range === r.key ? 'secondary' : 'ghost'} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </Button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-fg-muted">Could not load the timeline.</p>}
      {data && (
        <>
          <div className="relative pt-6" aria-hidden>
            {/* event markers */}
            {events.map((e) => (
              <span
                key={e.id}
                title={`${fmt(e.at, range)} · ${e.message}`}
                className={cx('absolute top-0 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] ring-2 ring-bg-to', DOT_CLASS[e.severity] ?? DOT_CLASS.info)}
                style={{ left: `${positionPct(e.at, data.from, data.to)}%` }}
              />
            ))}
            {/* status bar */}
            <div className="relative h-4 overflow-hidden rounded-full bg-surface-strong" data-testid="status-bar">
              {segments.map((s, i) => (
                <span
                  key={i}
                  data-status={s.status}
                  className={cx('absolute inset-y-0', SEG_CLASS[s.status])}
                  style={{ left: `${s.left}%`, width: `${s.width}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-fg-muted">
              <span>{fmt(data.from, range)}</span>
              <span>now</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-fg-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-normal/50" /> Normal</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-warning/70" /> Warning</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-critical/80" /> Critical</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-primary" /> Event</span>
          </div>

          <ol className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1" aria-label="Events">
            {events.length === 0 && <li className="text-sm text-fg-muted">No events in this range.</li>}
            {[...events].reverse().map((e) => (
              <li key={e.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                <time className="shrink-0 pt-0.5 font-mono text-xs text-fg-muted" dateTime={e.at}>
                  {fmt(e.at, range)}
                </time>
                <Badge tone={BADGE_TONE[e.severity] ?? 'neutral'} dot={false}>
                  {TYPE_LABEL[e.type] ?? e.type}
                </Badge>
                <span className="text-sm text-fg">{e.message}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  )
}
