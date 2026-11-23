// Feature 41: "a large red button on every Patient Portal screen". Mounted by the patient layouts, so it is one tap
// away on the profile, hospital finder and tracking screens too. It opens the same two-step SOS confirmation.
import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { monitoringApi } from '../monitoring/api.js'

const SosDialog = lazy(() => import('./SosDialog.jsx').then((m) => ({ default: m.SosDialog })))

export default function GlobalSos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [patientId, setPatientId] = useState(null)
  const [error, setError] = useState('')
  if (user?.role !== 'patient' || !user.patient?.patientId) return null

  async function start() {
    setError('')
    try {
      setPatientId((await monitoringApi.getPatient(user.patient.patientId)).id)
      setOpen(true)
    } catch {
      setError('Could not start SOS. Call 112 or 108 now.')
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
        {error && <p role="alert" className="rounded-lg bg-surface-strong px-3 py-2 text-sm text-critical">{error} <a href="tel:112" className="underline">Call 112</a></p>}
        <button
          type="button"
          aria-label="Send emergency SOS"
          onClick={start}
          className="ht-pulse-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-critical-solid text-lg font-extrabold tracking-wider text-critical-fg shadow-[0_0_30px_-4px_var(--ht-critical)] transition hover:brightness-110 active:scale-95"
        >
          SOS
        </button>
      </div>
      {open && patientId && (
        <Suspense fallback={null}>
          <SosDialog open={open} onClose={() => setOpen(false)} patientId={patientId} onSent={() => navigate('/patient/emergency')} />
        </Suspense>
      )}
    </>
  )
}
