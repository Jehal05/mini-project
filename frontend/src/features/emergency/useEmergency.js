// The patient's live emergency case: REST first (so a page reload restores the confirmation screen
// and its countdown), then Socket.IO events in the room patient:<id> (joined by useLiveVitals).
import { useCallback, useEffect, useRef, useState } from 'react'
import { EMERGENCY_EVENTS } from '@shared/emergency.js'
import { getSocket } from '../monitoring/useLiveVitals.js'
import { emergencyApi } from './api.js'
import { clockOffset } from './clock.js'

const POLL_MS = 10_000

export function useEmergency(patientId, refreshKey = 0) {
  const [caseView, setCaseView] = useState(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    if (!patientId) return null
    try {
      const res = await emergencyApi.active(patientId)
      if (!alive.current) return null
      setCaseView(res.case)
      setOffsetMs(clockOffset(res.serverNow))
      setError(null)
      setLoaded(true)
      return res.case
    } catch (e) {
      if (alive.current) setError(e)
      return null
    }
  }, [patientId])

  useEffect(() => {
    alive.current = true
    setCaseView(null)
    setLoaded(false)
    load()
    let detach = () => {}
    getSocket().then((s) => {
      if (!alive.current) return
      const onEvent = (p) => p?.patientId === patientId && load()
      const names = Object.values(EMERGENCY_EVENTS)
      for (const n of names) s.on(n, onEvent)
      // Events sent while the connection was down are gone: read the case again when it comes back.
      const onReconnect = () => load()
      s.on('connect', onReconnect)
      detach = () => {
        names.forEach((n) => s.off(n, onEvent))
        s.off('connect', onReconnect)
      }
    })
    return () => {
      alive.current = false
      detach()
    }
  }, [patientId, load, refreshKey])

  // A safety net if the socket is down: re-read while a case is live.
  const live = Boolean(caseView?.isLive)
  useEffect(() => {
    if (!live) return undefined
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [live, load])

  const apply = useCallback((view) => {
    if (view) setCaseView(view.isLive ? view : null)
    return view
  }, [])

  return { caseView, offsetMs, loaded, error, reload: load, apply }
}
