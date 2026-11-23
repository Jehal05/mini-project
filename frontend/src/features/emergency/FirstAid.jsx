// Feature 104: first aid and one-tap calls. The text and the aspirin rule come from the server
// (shared/firstaid.js): aspirin appears only when the record clearly allows it. The official source
// is credited on screen, and the dispatcher's instructions always come first.
import { useEffect, useState } from 'react'
import { Badge, Card } from '../../design/index.js'
import { CallLinks } from './CallLinks.jsx'
import { emergencyApi } from './api.js'

export function FirstAid({ patientId, defaultOpen = true }) {
  const [aid, setAid] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    emergencyApi
      .firstAid(patientId)
      .then((a) => alive && setAid(a))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [patientId])

  return (
    <Card title="First aid while you wait" subtitle="Simulated demo text · not medical advice" action={<Badge tone="accent" dot={false}>Simulated</Badge>}>
      <CallLinks className="mb-3" />
      {failed && <p className="text-sm text-fg-muted">First-aid steps could not be loaded. Call 112 or 108 and follow the dispatcher.</p>}
      {aid && (
        <details open={defaultOpen}>
          <summary className="cursor-pointer text-sm font-semibold">Steps</summary>
          <p className="mt-2 rounded-lg border border-line bg-surface-strong px-3 py-2 text-sm font-medium">{aid.dispatcherFirst}</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {aid.steps.map((s) => (
              <li key={s.id}>
                <strong>{s.title}.</strong> {s.text}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-fg-muted">
            Source:{' '}
            <a href={aid.source.url} target="_blank" rel="noopener noreferrer" className="text-link underline">
              {aid.source.name}
            </a>
            . Also consistent with {aid.source.also}.
          </p>
        </details>
      )}
    </Card>
  )
}
