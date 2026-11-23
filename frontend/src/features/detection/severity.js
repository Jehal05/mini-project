// How a severity level (feature 38) is shown. Red is reserved for Level 3 (critical):
// the design system keeps red for critical status, SOS and emergencies only.
import { SEVERITY } from '@shared/emergency.js'
import { DETECTION_OUTCOME } from '@shared/detection.js'

export const LEVEL_TONE = { 0: 'normal', 1: 'info', 2: 'warning', 3: 'critical' }
export const LEVEL_TEXT = {
  0: 'No abnormal pattern',
  1: SEVERITY[1].label,
  2: SEVERITY[2].label,
  3: SEVERITY[3].label,
}
export const LEVEL_SHORT = { 0: 'Clear', 1: 'Watch', 2: 'Urgent', 3: 'Critical' }
export const RISK_TONE = { low: 'normal', moderate: 'warning', high: 'critical' }

export const OUTCOME_TEXT = {
  [DETECTION_OUTCOME.PENDING]: 'Open',
  [DETECTION_OUTCOME.RESOLVED]: 'Back to normal',
  [DETECTION_OUTCOME.CASE_CREATED]: 'Emergency case opened',
  [DETECTION_OUTCOME.SENT]: 'Sent to hospitals',
  [DETECTION_OUTCOME.CANCELLED]: 'Cancelled',
  [DETECTION_OUTCOME.FALSE_ALARM]: 'False alarm',
}
