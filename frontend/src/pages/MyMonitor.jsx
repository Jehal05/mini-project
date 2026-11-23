import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MedicalBackground } from '../design/index.js'
import { monitoringApi } from '../features/monitoring/api.js'

/** A signed-in patient's live dashboard: the server returns only their own record, so we open the first one. */
export default function MyMonitor() {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    let active = true
    monitoringApi
      .listPatients()
      .then((list) => active && setState(list[0] ? { status: 'ok', code: list[0].patientCode } : { status: 'none' }))
      .catch((e) => active && setState({ status: 'error', message: e.message }))
    return () => { active = false }
  }, [])

  if (state.status === 'ok') return <Navigate to={`/patient/monitor/${encodeURIComponent(state.code)}`} replace />
  return (
    <MedicalBackground portal="patient">
      <p className="px-6 py-10 text-sm text-fg-muted" role="status">
        {state.status === 'loading' && 'Loading your dashboard…'}
        {state.status === 'none' && 'No monitoring record is linked to your account yet.'}
        {state.status === 'error' && `Could not load your dashboard: ${state.message}`}
      </p>
    </MedicalBackground>
  )
}
