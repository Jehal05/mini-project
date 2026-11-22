// Feature 91: the Digital Twin card. Your readings now, set against your own usual (baseline), in plain words,
// with the heart (101), what detection sees, and the trends (92). Simulated. Not a medical device.
import { useMemo } from 'react'
import { Badge, Card, SimulatedNotice } from '../../design/index.js'
import { useDetection } from '../detection/useDetection.js'
import { HeartView } from './HeartView.jsx'
import { TrendsPanel } from './TrendsPanel.jsx'
import { VITAL_UNIT, compareAll, heartState, twinSummary } from './twinModel.js'
import { formatVital } from '@shared/vitals.js'

// TODO(Jehal): feature 93 (full risk score) is blocked on feature 18. Not built; see docs/phase4-twin.md.
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
