// Feature 92: trends over the last 24 hours and 7 days, and a flag when a vital drifts from the patient's usual.
import { useEffect, useState } from 'react'
import { VITAL_KEYS } from './constants.js'
import { Badge } from '../emergency/kit.jsx'
import { fetchTrends } from '../lib/monitorApi.js'
import { VITAL_LABEL, driftText, restingText, trendText } from './twinModel.js'

const REFRESH_MS = 60_000

export function TrendsPanel({ patientId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetchTrends(patientId)
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError(e))
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [patientId])

  if (error && !data) return <p className="text-sm text-muted">Trends are not available right now.</p>
  if (!data)
    return (
      <p className="text-sm text-muted" role="status">
        Loading trends…
      </p>
    )

  const drifting = VITAL_KEYS.map((k) => driftText(data.drift?.[k], k)).filter(Boolean)
  const resting = data.restingHr
  return (
    <div>
      <h3 className="text-sm font-semibold">Trends</h3>
      <p className="mt-0.5 text-xs text-muted">From saved readings, compared over time. Simple statistics, not a medical assessment.</p>
      <div className="mt-2 overflow-x-auto" role="region" tabIndex={0} aria-label="Trends table">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <caption className="sr-only">Trend of each vital over the last 24 hours and the last 7 days</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">Vital</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Last 24 hours</th>
              <th scope="col" className="py-2 font-semibold">Last 7 days</th>
            </tr>
          </thead>
          <tbody>
            {VITAL_KEYS.map((k) => (
              <tr key={k} className="border-b border-line/60">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{VITAL_LABEL[k]}</th>
                <td className="py-2 pr-3">{trendText(data.last24h?.[k], k, 'day')}</td>
                <td className="py-2">{trendText(data.last7d?.[k], k, 'week')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm">{restingText(resting)}</p>
      {resting?.days?.some((d) => d.value !== null) && (
        <ol className="mt-1 flex flex-wrap gap-2 text-xs text-muted" aria-label="Resting heart rate for each of the last 7 days, oldest first">
          {resting.days.map((d, i) => (
            <li key={d.start} className="rounded-ui border border-line px-2 py-1 font-mono">
              <span className="sr-only">{`Day ${i + 1}: `}</span>
              {d.value === null ? '--' : d.value}
            </li>
          ))}
        </ol>
      )}

      {drifting.length > 0 ? (
        <ul className="mt-3 space-y-1" aria-label="Drift from your usual">
          {drifting.map((t) => (
            <li key={t} className="text-sm">
              <Badge tone="moderate">Drift</Badge> {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No vital has drifted away from your usual over the last few days.</p>
      )}
    </div>
  )
}
