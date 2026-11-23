const TIME = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Feature 70: every timestamp from detection to admission, newest last. Shown in all three portals. */
export default function Timeline({ events }) {
  if (!events?.length) return <p className="hint">Nothing recorded yet.</p>
  return (
    <ol className="timeline" aria-label="Emergency response timeline">
      {events.map((e, i) => (
        <li key={`${e.type}-${i}`}><time className="mono" dateTime={new Date(e.at).toISOString()}>{TIME(e.at)}</time> <span>{e.message ?? e.type}</span></li>
      ))}
    </ol>
  )
}
