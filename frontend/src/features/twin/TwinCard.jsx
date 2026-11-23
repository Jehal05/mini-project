// Feature 91: the Digital Twin card. Your readings now, set against your own usual (baseline), in plain words,
// with the heart (101), what detection sees, and the trends (92). Simulated. Not a medical device.
import { useMemo } from 'react'
import { Badge, Card, SimulatedNotice } from '../../design/index.js'
import { useDetection } from '../detection/useDetection.js'
import { HeartView } from './HeartView.jsx'
import { TrendsPanel } from './TrendsPanel.jsx'
import { VITAL_UNIT, compareAll, heartState, twinSummary } from './twinModel.js'
import { formatVital } from '@shared/vitals.js'

// Points that come from the current readings. Everything else in the breakdown comes from the health profile.
const FROM_READINGS = /critical$|warning$|far from own baseline$|^Severity level/i

/** Feature 93: the 0-100 score, split into what your profile adds and what your readings add. */
export function RiskSummary({ risk }) {
  if (!risk || typeof risk.score !== 'number') return null
  const profile = risk.breakdown.filter((b) => !FROM_READINGS.test(b.factor))
  const readings = risk.breakdown.filter((b) => FROM_READINGS.test(b.factor))
  const total = (list) => list.reduce((n, b) => n + b.points, 0)
  const group = (title, list) => (
    <section aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{title} (+{Math.round(total(list))})</h3>
      {list.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing adds to the score here.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line rounded-xl border border-line text-sm">
          {list.map((b) => (
            <li key={b.factor} className="flex justify-between gap-3 px-3 py-1.5">
              <span>{b.factor}</span>
              <span className="font-mono text-fg-muted">+{b.points}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4" data-testid="twin-risk">
      <h3 className="text-base font-semibold">
        Cardiac risk score: <span className="font-mono">{risk.score}</span> out of 100 ({risk.label ?? risk.level})
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {group('From your health profile', profile)}
        {group('From your readings now', readings)}
      </div>
      <p className="text-xs text-fg-muted">The gauge is in the detection panel. Add family history and conditions in your profile to make this more accurate. A demonstration, not a medical score.</p>
    </div>
  )
}

export function TwinCard({ patientId, live, baseline }) {
  const { status: detection } = useDetection(patientId)
  const rows = useMemo(() => compareAll(live, baseline), [live, baseline])
  const summary = useMemo(() => twinSummary(rows, detection), [rows, detection])
  const heart = heartState(live)

  return (
    <Card title="Digital Twin" subtitle="Your readings compared with your own usual · simulated" action={<Badge tone="accent" dot={false}>Simulated</Badge>} aria-label="Digital Twin">
      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
        <HeartView bpm={heart.bpm} status={heart.status} />
        <div>
          <p className="text-base font-semibold" role="status">{summary.headline}</p>
          {summary.lines.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {summary.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-fg-muted">{summary.detection}</p>
        </div>
      </div>

      <RiskSummary risk={detection?.risk} />

      <div className="mt-4 overflow-x-auto" role="region" tabIndex={0} aria-label="Usual and current readings">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <caption className="sr-only">Your usual and current reading for each vital</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">Vital</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Your usual</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Now</th>
              <th scope="col" className="py-2 font-semibold">Compared with usual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line/60">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{r.label}</th>
                <td className="py-2 pr-3 font-mono">{r.baseline === null ? '--' : `${formatVital(r.key, r.baseline)} ${VITAL_UNIT[r.key]}`}</td>
                <td className="py-2 pr-3 font-mono">{r.now === null ? '--' : `${formatVital(r.key, r.now)} ${VITAL_UNIT[r.key]}`}</td>
                <td className="py-2">
                  {r.relation === 'no_data' ? 'not enough data yet' : r.relation === 'usual' ? 'in line' : `${r.relation === 'above' ? 'above' : 'below'} usual`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <TrendsPanel patientId={patientId} />
      </div>
      <SimulatedNotice className="mt-4" />
    </Card>
  )
}
