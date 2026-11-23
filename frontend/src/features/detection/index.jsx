// One lazy chunk for everything detection draws on the patient dashboard (keeps the first screen small).
import { DetectionPanel } from './DetectionPanel.jsx'
import { DetectionHistory } from './DetectionHistory.jsx'
import { useDetection } from './useDetection.js'

export { RiskGauge } from './RiskGauge.jsx'
export { DetectionPanel, DetectionHistory }

/** The live panel for one patient: loads the status and follows detection events. */
export function DetectionSection({ patientId }) {
  const { status, error, caseInfo } = useDetection(patientId)
  return <DetectionPanel status={status} error={error} caseInfo={caseInfo} />
}

/** The history table; reloads when the level changes. */
export function DetectionHistorySection({ patientId, refreshKey }) {
  return <DetectionHistory patientId={patientId} refreshKey={refreshKey} />
}
