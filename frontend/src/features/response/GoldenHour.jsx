import { useNow, clock } from './hooks.js'

/** Feature 105: the three running clocks of a case. A stage turns red once it passes its target. `stages` come from the server. */
export default function GoldenHour({ stages, serverOffsetMs = 0 }) {
  const now = useNow(1000) + serverOffsetMs
  return (
    <ul className="golden" aria-label="Golden-hour timers">
      {stages.map((s) => {
        const elapsed = s.state === 'running' ? Math.max(0, now - s.startedAt) : s.elapsedMs
        const over = s.state === 'waiting' ? false : elapsed > s.targetMs
        return (
          <li key={s.key} className={`golden-item${over ? ' golden-over' : ''}`}>
            <span className="golden-label">{s.label}</span>
            <span className="golden-clock mono" aria-label={`${s.state === 'waiting' ? 'not started' : `${clock(elapsed)} elapsed`}`}>{s.state === 'waiting' ? '–:––' : clock(elapsed)}</span>
            <span className="hint">target {Math.round(s.targetMs / 60_000)} min{s.state === 'done' ? ' · done' : ''}{over ? ' · over target' : ''}</span>
          </li>
        )
      })}
    </ul>
  )
}
