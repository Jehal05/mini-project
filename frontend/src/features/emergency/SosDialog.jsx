// Feature 41: the SOS button's confirmation. One deliberate tap to send, so a pocket press cannot
// open an emergency. If a case is already open it joins it (the server never makes a second one).
import { useState } from 'react'
import { Button, Modal, SimulatedNotice } from '../../design/index.js'
import { CallLinks } from './CallLinks.jsx'
import { emergencyApi } from './api.js'

/** One GPS reading, or nothing after a few seconds: SOS must never wait on the location. */
export function currentLocation(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const geo = globalThis.navigator?.geolocation
    if (!geo) return resolve(undefined)
    const timer = setTimeout(() => resolve(undefined), timeoutMs + 500)
    geo.getCurrentPosition(
      (p) => {
        clearTimeout(timer)
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), source: 'gps' })
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      },
      { timeout: timeoutMs, maximumAge: 30000 },
    )
    return undefined
  })
}

export function SosDialog({ open, onClose, patientId, onSent }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const location = await currentLocation()
      const res = await emergencyApi.sos(patientId, location)
      onSent?.(res.case)
      onClose()
    } catch (e) {
      setError(e.message || 'Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="critical"
      title="Send an emergency request?"
      description="This asks nearby hospitals for help and alerts your emergency contacts (simulated). If you are in danger right now, call 112 or 108 first."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button variant="danger" loading={busy} onClick={send}>
            Send SOS
          </Button>
        </>
      }
    >
      <CallLinks />
      <SimulatedNotice className="mt-4" />
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error} Call 112 or 108 instead.
        </p>
      )}
    </Modal>
  )
}
