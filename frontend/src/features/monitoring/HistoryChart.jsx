// Feature 28: Recharts graphs for the last hour (live), 24 hours and 7 days.
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DEFAULT_THRESHOLDS, formatVital } from '@shared/vitals.js'
import { Card, Button, SimulatedBadge } from '../../design/index.js'
import { monitoringApi } from './api.js'
import { CHART_VITALS, RANGES, formatTick, mergeLive, thresholdGuides, yDomain } from './chartData.js'
import { useTokens } from './useTokens.js'

function ChartTooltip({ active, payload, label, lines }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-bg-to/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="text-fg-muted">{new Date(label).toLocaleString()}</p>
      {lines.map((k) => (
        <p key={k} className="font-mono text-fg">
          {DEFAULT_THRESHOLDS[k].label}: {formatVital(k, p[k])} {DEFAULT_THRESHOLDS[k].unit}
        </p>
      ))}
      {p.samples && <p className="text-fg-muted">average of {p.samples} readings</p>}
      <p className="mt-1 text-[10px] uppercase tracking-wide text-accent">Simulated</p>
    </div>
  )
}

export function HistoryChart({ patientId, live }) {
  const tokens = useTokens()
  const [range, setRange] = useState('1h')
  const [vital, setVital] = useState('hr')
  const [points, setPoints] = useState([])
  const [state, setState] = useState('loading')

  // Load history when the patient or range changes; refresh long ranges every minute.
  useEffect(() => {
    if (!patientId) return undefined
    let cancelled = false
    const load = () =>
      monitoringApi
        .history(patientId, range)
        .then((res) => {
          if (cancelled) return
          setPoints(res.points)
          setState('ready')
        })
        .catch(() => !cancelled && setState('error'))
    setState('loading')
    load()
    const timer = range === '1h' ? null : setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [patientId, range])

  // Last hour is live: append every 2-second update.
  useEffect(() => {
    if (range === '1h' && live && state === 'ready') setPoints((prev) => mergeLive(prev, live))
  }, [live, range, state])

  const tab = CHART_VITALS.find((v) => v.key === vital)
  const guides = thresholdGuides(tab.lines[0])
  const domain = useMemo(() => yDomain(points, tab.lines, guides), [points, tab, guides])
  // A real time axis, so dense live points (every 2 s) and saved points (every 30 s) are spaced correctly.
  const data = useMemo(() => points.map((p) => ({ ...p, t: Date.parse(p.at) })), [points])
  const lineColors = [tokens.primary, tokens.accent]

  return (
    <Card
      title="Health history"
      subtitle={range === '1h' ? 'Live · saved every 30 seconds' : range === '24h' ? '5-minute averages' : '30-minute averages'}
      action={<SimulatedBadge />}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Vital">
          {CHART_VITALS.map((v) => (
            <Button key={v.key} size="sm" variant={vital === v.key ? 'primary' : 'ghost'} aria-pressed={vital === v.key} onClick={() => setVital(v.key)}>
              {v.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={range === r.key ? 'secondary' : 'ghost'} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64" data-testid="history-chart">
        {state === 'error' ? (
          <p className="pt-24 text-center text-sm text-fg-muted">Could not load history. Is the backend running?</p>
        ) : points.length === 0 ? (
          <p className="pt-24 text-center text-sm text-fg-muted">{state === 'loading' ? 'Loading…' : 'No readings yet.'}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={tokens.line} strokeDasharray="3 3" vertical={false} />
              {guides && (
                <ReferenceArea y1={guides.normal[0]} y2={guides.normal[1]} fill={tokens.normal} fillOpacity={0.07} ifOverflow="extendDomain" />
              )}
              {guides?.critical.map((c) => (
                <ReferenceLine key={c} y={c} stroke={tokens.critical} strokeDasharray="4 4" strokeOpacity={0.6} />
              ))}
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => formatTick(v, range)}
                stroke={tokens['fg-muted']}
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis domain={domain} allowDecimals={tab.key === 'temp'} tickCount={6} stroke={tokens['fg-muted']} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} width={48} />
              <Tooltip content={<ChartTooltip lines={tab.lines} />} />
              {tab.lines.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={DEFAULT_THRESHOLDS[k].label}
                  stroke={lineColors[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        Shaded band: normal range. Dashed lines: critical limits ({guides?.unit}). Demo thresholds, not clinical criteria.
        {tab.key === 'bp' && ' Cyan: systolic · violet: diastolic.'}
      </p>
    </Card>
  )
}
