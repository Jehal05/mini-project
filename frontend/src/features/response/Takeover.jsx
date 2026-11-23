import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startAlarm } from './alarm.js'
import { responseApi } from './api.js'
import { clock, useNow } from './hooks.js'
import { REJECT_REASONS, REJECT_LABEL } from './reasons.js'

/**
 * Feature 103: a critical case fills the hospital screen in red, with an alarm, until someone accepts, rejects or
 * acknowledges it. "Acknowledge" hides the screen but the case stays at the top of the queue.
 */
export default function Takeover({ items, offsetMs, onChanged }) {
  const navigate = useNavigate()
  const [seen, setSeen] = useState(() => new Set())
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('no_beds')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const now = useNow(1000) + offsetMs
  const target = items.find((i) => i.needsResponse && i.severity === 3 && !seen.has(i.id))
  const acceptRef = useRef(null)

  const id = target?.id
  useEffect(() => {
    if (!id) return undefined
    setRejecting(false)
    setError('')
    acceptRef.current?.focus()
    return startAlarm()
  }, [id])

  if (!target) return null
  const left = new Date(target.respondBy).getTime() - now
  const ack = () => setSeen((s) => new Set(s).add(target.id))
  const act = async (fn, after) => {
    setBusy(true)
    setError('')
    try { await fn(); await onChanged?.(); after?.() } catch (e) { setError(e.message ?? 'That did not work. Try again.') } finally { setBusy(false) }
  }
  return (
    <div className="takeover" role="alertdialog" aria-modal="true" aria-labelledby="takeover-h" aria-describedby="takeover-d">
      <div className="takeover-card">
        <p className="mono">SIMULATED EMERGENCY · DEMONSTRATION ONLY · NOT A MEDICAL DEVICE</p>
        <h2 id="takeover-h">Critical cardiac emergency</h2>
        <div id="takeover-d">
          <p><strong>Patient {target.patientCode}</strong> · risk score {target.riskScore}/100 · {target.distanceKm} km away</p>
          {target.vitals && <p>Heart rate {target.vitals.hr} bpm · BP {target.vitals.sys}/{target.vitals.dia} · SpO2 {target.vitals.spo2}%</p>}
          <p className="countdown" role="timer" aria-live="off">{left > 0 ? `Respond within ${clock(left)}` : 'Response time is over: answer now'}</p>
        </div>
        {error && <p role="alert">{error}</p>}
        {rejecting ? (
          <div>
            <label htmlFor="takeover-reason">Reason for rejecting</label>
            <select id="takeover-reason" value={reason} onChange={(e) => setReason(e.target.value)}>{REJECT_REASONS.map((r) => <option key={r} value={r}>{REJECT_LABEL[r]}</option>)}</select>
            <div className="actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => responseApi.reject(target.id, reason))}>Confirm rejection</button>
              <button type="button" className="btn btn-secondary" onClick={() => setRejecting(false)}>Back</button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button ref={acceptRef} type="button" className="btn btn-accept" disabled={busy} onClick={() => act(() => responseApi.accept(target.id), () => navigate(`/hospital/emergencies/${target.id}`))}>Accept emergency</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
            <button type="button" className="btn btn-secondary" onClick={ack}>Acknowledge</button>
          </div>
        )}
        <p><a className="call-btn" href="tel:112">Call 112</a> <a className="call-btn" href="tel:108">Call 108</a></p>
      </div>
    </div>
  )
}
