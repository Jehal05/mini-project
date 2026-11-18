// Features 34, 37, 38: what the detection engine sees right now, why, and the risk gauge.
import { Badge, Card, SimulatedNotice } from '../../design/index.js'
import { RiskGauge } from './RiskGauge.jsx'
import { LEVEL_SHORT, LEVEL_TEXT, LEVEL_TONE } from './severity.js'

const CARD_STATUS = { 0: 'normal', 1: 'info', 2: 'warning', 3: 'critical' }

const HEADLINE = {
  0: 'No abnormal pattern. Your readings match your usual range.',
  1: 'Watch: one reading is outside the normal range. Nothing else happens yet.',
  2: 'Urgent: a reading is in the critical range or far from your usual. Your contacts will be alerted in a later phase.',
  3: 'Critical cardiac pattern. An emergency case has been opened; the confirmation step arrives in a later phase.',
}

const VISIBLE_REASONS = 3

function Reason({ rule, main }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Badge tone={LEVEL_TONE[rule.level]} dot={false} className="shrink-0">
        {LEVEL_SHORT[rule.level]}
      </Badge>
      <span className="min-w-0">
        {main && <span className="mr-1.5 font-semibold">Main reason:</span>}
        {rule.message}
      </span>
    </li>
  )
}

export function DetectionPanel({ status, error, caseInfo }) {
  if (error) {
    return (
      <Card title="Emergency detection" status="warning">
        <p className="text-sm">Detection status is not available right now.</p>
      </Card>
    )
  }
  if (!status) {
    return (
      <Card title="Emergency detection">
        <p className="py-6 text-center text-sm text-fg-muted" role="status">
          Loading detection…
        </p>
      </Card>
    )
  }

  const { level, rules, risk } = status
  const theCase = status.case ?? (caseInfo ? { id: caseInfo.caseId } : null)

  return (
    <Card
      title="Emergency detection"
      subtitle="Rule-based and simulated · not a medical device"
      status={CARD_STATUS[level]}
      action={
        <Badge tone={LEVEL_TONE[level]} dot={level > 0 ? true : undefined} aria-label={`Detection level: ${LEVEL_TEXT[level]}`}>
          {level === 0 ? 'Clear' : LEVEL_TEXT[level]}
        </Badge>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-sm font-medium" role="status" aria-live="polite" data-testid="detection-headline">
            {HEADLINE[level]}
          </p>

          {rules.length > 0 && (
            <>
              <ul className="mt-3 space-y-2" aria-label="Why this level">
                {rules.slice(0, VISIBLE_REASONS).map((r, i) => (
                  <Reason key={r.rule} rule={r} main={i === 0} />
                ))}
              </ul>
              {rules.length > VISIBLE_REASONS && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-link">{rules.length - VISIBLE_REASONS} more reasons</summary>
                  <ul className="mt-2 space-y-2" aria-label="More reasons">
                    {rules.slice(VISIBLE_REASONS).map((r) => (
                      <Reason key={r.rule} rule={r} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {level === 3 && theCase && (
            <p className="mt-3 rounded-xl border border-critical/40 bg-critical/10 px-3 py-2 text-sm" data-testid="case-notice">
              Emergency case <span className="font-mono">{String(theCase.id).slice(-6).toUpperCase()}</span> is open and waiting for confirmation.
            </p>
          )}
        </div>

        <div className="justify-self-center">
          <RiskGauge score={risk.score} level={risk.level} />
        </div>
      </div>

      {risk.breakdown.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-link">How the risk score is built</summary>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {risk.breakdown.map((b) => (
              <li key={b.factor} className="flex justify-between gap-3 px-3 py-1.5">
                <span>{b.factor}</span>
                <span className="font-mono text-fg-muted">+{b.points}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <SimulatedNotice className="mt-4" />
    </Card>
  )
}
