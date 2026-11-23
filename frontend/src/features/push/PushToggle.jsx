import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushStatus } from './push.js'

/** A button to turn alerts on or off for this device. `save(subscription)` stores it on the server. */
export default function PushToggle({ save, label = 'Get alerts on this device', hint }) {
  const [state, setState] = useState('checking')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushStatus().then(setState) }, [])
  if (state === 'checking' || state === 'unsupported') return null

  async function toggle() {
    setBusy(true); setError('')
    try {
      if (state === 'on') await disablePush(); else await enablePush(save)
      setState(await pushStatus())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="push-toggle">
      <button type="button" className="btn btn-secondary" onClick={toggle} disabled={busy || state === 'denied'} aria-pressed={state === 'on'}>
        {state === 'on' ? 'Turn off alerts on this device' : label}
      </button>
      {state === 'denied' && <p className="hint">Notifications are blocked in this browser. Allow them in the site settings to get alerts.</p>}
      {hint && state !== 'denied' && <p className="hint">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
