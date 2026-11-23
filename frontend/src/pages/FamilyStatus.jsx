// The page behind the link in an emergency contact's message (feature 47/48). No login: the token in
// the link is the credential. It shows what a relative needs and lets them tap "Seen".
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Button, Card, MedicalBackground, SimulatedNotice } from '../design/index.js'
import { emergencyApi } from '../features/emergency/api.js'
import { CallLinks } from '../features/emergency/CallLinks.jsx'
import { CANCEL_LABEL, STATUS_TEXT, STATUS_TONE } from '../features/emergency/status.js'

export default function FamilyStatus() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => emergencyApi.publicStatus(token).then((d) => (setData(d), setError(null))).catch((e) => setError(e)), [token])
  const invalid = error?.status === 404 // a wrong link stays wrong: stop asking
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (invalid) return undefined
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [load, invalid])

  async function seen() {
    setBusy(true)
    try {
      await emergencyApi.seen(token)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <MedicalBackground portal="patient">
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-bold">Emergency status</h1>
        <SimulatedNotice className="mt-3" />
        {error && (
          <Card status="warning" className="mt-6">
            <p className="text-sm">{error.status === 404 ? 'This status link is not valid.' : 'Cannot reach HealthTwin right now. Try again in a moment.'}</p>
          </Card>
        )}
        {data && (
          <Card className="mt-6" status={data.isLive ? 'critical' : undefined} title={data.patientName} subtitle={`Hello ${data.contactName}`} action={<Badge tone={STATUS_TONE[data.status]}>{STATUS_TEXT[data.status]}</Badge>}>
            <p className="text-sm">
              {data.isLive ? `${data.patientName} may need urgent help. Try to call them now.` : `This emergency is no longer open${data.cancellation ? `: ${CANCEL_LABEL[data.cancellation.reason]}` : ''}.`}
            </p>
            <p className="mt-2 text-xs text-fg-muted">Started {new Date(data.since).toLocaleString()}</p>
            {data.location && (
              <p className="mt-3 text-sm">
                Last known location:{' '}
                <a href={`https://www.openstreetmap.org/?mlat=${data.location.lat}&mlon=${data.location.lng}#map=17/${data.location.lat}/${data.location.lng}`} target="_blank" rel="noopener noreferrer" className="text-link underline">
                  open in a map
                </a>{' '}
                <span className="text-fg-muted">(updated {new Date(data.location.updatedAt).toLocaleTimeString()})</span>
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={seen} disabled={data.seen} loading={busy}>
                {data.seen ? 'You marked this as seen' : 'I have seen this'}
              </Button>
              <CallLinks />
            </div>
          </Card>
        )}
      </div>
    </MedicalBackground>
  )
}
