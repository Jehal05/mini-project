// One lazy chunk for everything the SOS flow draws on the patient dashboard.
import { useState } from 'react'
import { Button, Card } from '../../design/index.js'
import { CancelDialog } from './CancelDialog.jsx'
import { CaseStatus } from './CaseStatus.jsx'
import { ConfirmationScreen } from './ConfirmationScreen.jsx'
import { EmergencyHistory } from './EmergencyHistory.jsx'
import { FirstAid } from './FirstAid.jsx'
import { LevelAlert } from './LevelAlert.jsx'
import { LocationShare } from './LocationShare.jsx'
import { emergencyApi } from './api.js'
import { CANCEL_LABEL } from './status.js'
import { useEmergency } from './useEmergency.js'

export { SosDialog } from './SosDialog.jsx'
export { EmergencyHistory as EmergencyHistorySection }

/** Level 2/3 alert, then the live emergency: confirmation, search, location, first aid, cancel. */
export function EmergencySection({ patientId, refreshKey }) {
  const { caseView, offsetMs, apply } = useEmergency(patientId, refreshKey)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [ended, setEnded] = useState(null)

  const live = Boolean(caseView?.isLive)
  const awaiting = caseView?.status === 'awaiting_confirmation'
  const afterAcceptance = ['accepted', 'ambulance_assigned', 'patient_on_board'].includes(caseView?.status)

  async function confirm(symptoms) {
    apply((await emergencyApi.confirm(caseView.id, symptoms)).case)
  }
  async function cancel(reason, note) {
    const res = await emergencyApi.cancel(caseView.id, reason, note)
    setCancelOpen(false)
    setEnded(res.case)
    apply(res.case)
  }

  return (
    <div className="mt-6 space-y-4" aria-label="Emergency">
      <LevelAlert patientId={patientId} />
      {live &&
        (awaiting ? (
          <ConfirmationScreen
            key={caseView.id}
            caseView={caseView}
            offsetMs={offsetMs}
            onConfirm={confirm}
            onSymptoms={(s) => emergencyApi.saveSymptoms(caseView.id, s)}
            onCancelRequest={() => setCancelOpen(true)}
          />
        ) : (
          <CaseStatus caseView={caseView} offsetMs={offsetMs} onCancelRequest={() => setCancelOpen(true)} />
        ))}
      {live && (
        <div className="grid gap-4 md:grid-cols-2">
          <LocationShare caseId={caseView.id} location={caseView.location} />
          <FirstAid patientId={patientId} />
        </div>
      )}
      {!live && ended && (
        <Card title="Emergency cancelled" subtitle="Simulated" action={<Button size="sm" variant="ghost" onClick={() => setEnded(null)}>Dismiss</Button>}>
          <p className="text-sm">Reason: {CANCEL_LABEL[ended.cancellation?.reason] ?? 'not given'}. If you need help again, press SOS or call 112.</p>
        </Card>
      )}
      <CancelDialog open={cancelOpen && live} onClose={() => setCancelOpen(false)} onCancel={cancel} afterAcceptance={afterAcceptance} />
    </div>
  )
}
