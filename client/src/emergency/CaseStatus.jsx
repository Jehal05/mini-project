// Features 45, 47, 48, 49 on screen: where the search is, who was alerted and who has seen it, and cancel.
import { ESCALATION } from './constants.js'
import { Badge, Button, Card } from './kit.jsx'
import { CallLinks } from './CallLinks.jsx'
import { secondsLeft } from './clock.js'
import { useTick } from './useTick.js'
import { SOURCE_TEXT, STATUS_TEXT, STATUS_TONE } from './status.js'

const time = (v) => (v ? new Date(v).toLocaleTimeString() : '')

function Search({ c, offsetMs }) {
  useTick(500)
  const round = c.escalation.round
  const rounds = ESCALATION.RADII_KM.length
  const widenIn = secondsLeft(new Date(Date.parse(c.escalation.roundStartedAt) + ESCALATION.ROUND_TIMEOUT_MS).toISOString(), offsetMs)
  return (
    <div>
      <p className="text-lg font-semibold">Help has been requested.</p>
      <p className="mt-1 text-sm">
        Looking for a hospital within <strong>{c.escalation.radiusKm} km</strong> (round {round} of {rounds}).
      </p>
      <p className="mt-1 text-xs text-muted">
        If nobody accepts, the search widens to {ESCALATION.RADII_KM[Math.min(round, rounds - 1)]} km {round < rounds ? `in about ${widenIn} s` : 'and the central admin is alerted'}.
      </p>
    </div>
  )
}

export function CaseStatus({ caseView: c, offsetMs = 0, onCancelRequest }) {
  const tone = STATUS_TONE[c.status]
  const unresolved = c.status === 'unresolved'
  const searching = c.status === 'pending'
  const post = ['accepted', 'ambulance_assigned', 'en_route'].includes(c.status)

  return (
    <Card
      status={tone === 'neutral' ? undefined : tone}
      title="Emergency in progress"
      subtitle={`${SOURCE_TEXT[c.source] ?? c.source} · simulated`}
      action={<Badge tone={tone}>{STATUS_TEXT[c.status]}</Badge>}
      aria-label="Emergency status"
    >
      {searching && <Search c={c} offsetMs={offsetMs} />}
      {unresolved && (
        <div role="alert">
          <p className="text-lg font-semibold text-critical">No hospital has accepted yet. Call 112 now.</p>
          <p className="mt-1 text-sm">The central admin has been alerted. Do not wait: call for help yourself.</p>
        </div>
      )}
      {post && (
        <div>
          <p className="text-lg font-semibold">{STATUS_TEXT[c.status]}.</p>
          <p className="mt-1 text-sm">Stay where you are, rest and keep your phone with you.</p>
        </div>
      )}
      {!searching && !unresolved && !post && <p className="text-sm">{STATUS_TEXT[c.status]}.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CallLinks size={unresolved ? 'lg' : 'md'} />
        <Button variant="secondary" className="ml-auto" onClick={onCancelRequest}>
          Cancel emergency…
        </Button>
      </div>

      {c.contactAlerts.length > 0 && (
        <section className="mt-5 border-t border-line pt-4" aria-label="Emergency contacts alerted">
          <h3 className="text-sm font-semibold">Emergency contacts alerted</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {c.contactAlerts.map((a) => {
              const seen = c.acknowledgements.some((k) => k.recipientType === 'contact' && k.name === a.name)
              return (
                <li key={a.name} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  {a.relation && <span className="text-muted">({a.relation})</span>}
                  <Badge tone={seen ? 'low' : 'neutral'}>
                    {seen ? 'Seen' : 'Not seen yet'}
                  </Badge>
                  {a.whatsappLink && (
                    <a href={a.whatsappLink} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                      Message {a.name} on WhatsApp
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted">Timeline</summary>
        <ol className="mt-2 space-y-1">
          {c.timeline.map((e, i) => (
            <li key={`${e.type}-${i}`} className="flex gap-3">
              <span className="font-mono text-xs text-muted">{time(e.at)}</span>
              <span>{e.message ?? e.type}</span>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  )
}
