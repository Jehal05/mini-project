// Features 43 and 44: "Are you okay?", the four AHA warning signs, and a 10 s countdown. The SERVER
// decides when the time is up (it sends automatically); this screen only shows the time left, read
// from the case's stored deadline and corrected for the browser's clock.
import { useState } from 'react'
import { ESCALATION, SYMPTOMS } from './constants.js'
import { Badge, Button, Card } from './kit.jsx'
import { CallLinks } from './CallLinks.jsx'
import { secondsLeft } from './clock.js'
import { useTick } from './useTick.js'

export function ConfirmationScreen({ caseView, offsetMs = 0, onConfirm, onSymptoms, onCancelRequest }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(() => ({ ...(caseView.symptoms ?? {}) }))
  useTick(250)

  const total = ESCALATION.CONFIRM_COUNTDOWN_MS / 1000
  const left = secondsLeft(caseView.escalation?.confirmDeadline, offsetMs)
  const pct = Math.min(100, Math.max(0, (left / total) * 100))

  async function toggle(key) {
    const next = { ...picked, [key]: !picked[key] }
    setPicked(next)
    try {
      await onSymptoms({ [key]: next[key] }) // saved now, so the answer survives an automatic send
    } catch {
      /* the answer is also sent with "Send help now"; a failed early save is not worth interrupting for */
    }
  }

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm(Object.fromEntries(Object.keys(SYMPTOMS).map((k) => [k, Boolean(picked[k])])))
    } catch (e) {
      setError(e.message || 'Could not send. Call 112 now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      status="critical"
      title="Are you okay?"
      subtitle="Possible cardiac emergency detected (simulated)"
      action={<Badge tone="critical">Action needed</Badge>}
      aria-label="Emergency confirmation"
    >
      <div className="grid gap-5 md:grid-cols-[auto,1fr] md:items-center">
        <div className="text-center">
          <div role="timer" aria-live="off" aria-label={`Help is sent automatically in ${left} seconds`} className="font-mono text-6xl font-extrabold text-critical">
            {left}
          </div>
          <p className="text-xs text-muted">{left > 0 ? 'seconds until help is sent' : 'Sending help…'}</p>
          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-raised" aria-hidden>
            <div className="h-full rounded-full bg-critical transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div>
          <p className="text-sm">
            If you do not answer, help is sent <strong>automatically</strong>: you might not be able to. Tick anything you feel:
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(SYMPTOMS).map(([key, label]) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-3 rounded-ui border border-line bg-surface px-3 py-2.5 text-sm">
                  <input type="checkbox" checked={Boolean(picked[key])} onChange={() => toggle(key)} className="h-4 w-4 accent-accent" />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="danger" size="lg" loading={busy} onClick={send}>
          Send help now
        </Button>
        <Button variant="secondary" size="lg" onClick={onCancelRequest}>
          I&apos;m okay: cancel…
        </Button>
        <CallLinks className="ml-auto" />
      </div>
      <p className="mt-2 text-xs text-muted">Saying you are okay does not cancel by itself. You will choose a reason, so a real emergency is never dropped by accident.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
    </Card>
  )
}
