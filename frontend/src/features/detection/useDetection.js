// Live detection state for one patient: the REST status first, then Socket.IO events
// (detection:update, detection:cleared, emergency:created) in the room patient:<id>.
// The room is joined by useLiveVitals, which the dashboard already uses.
import { useEffect, useState } from 'react'
import { DETECTION_EVENTS } from '@shared/detection.js'
import { getSocket } from '../monitoring/useLiveVitals.js'
import { detectionApi } from './api.js'

export function useDetection(patientId) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [caseInfo, setCaseInfo] = useState(null)

  useEffect(() => {
    if (!patientId) return undefined
    setStatus(null)
    setError(null)
    setCaseInfo(null)
    let active = true
    let detach = () => {}

    detectionApi
      .status(patientId)
      .then((s) => active && setStatus(s))
      .catch((e) => active && setError(e))

    getSocket().then((s) => {
      if (!active) return
      const onUpdate = (p) => p.patientId === patientId && setStatus(p)
      const onCleared = (p) => p.patientId === patientId && detectionApi.status(patientId).then((st) => active && setStatus(st)).catch(() => {})
      const onCase = (p) => p.patientId === patientId && setCaseInfo(p)
      s.on(DETECTION_EVENTS.UPDATE, onUpdate)
      s.on(DETECTION_EVENTS.CLEARED, onCleared)
      s.on(DETECTION_EVENTS.CASE_CREATED, onCase)
      detach = () => {
        s.off(DETECTION_EVENTS.UPDATE, onUpdate)
        s.off(DETECTION_EVENTS.CLEARED, onCleared)
        s.off(DETECTION_EVENTS.CASE_CREATED, onCase)
      }
    })

    return () => {
      active = false
      detach()
    }
  }, [patientId])

  return { status, error, caseInfo }
}
