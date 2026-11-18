// Live vitals for one patient over Socket.IO (event vitals:update, room patient:<id>).
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { API_URL } from './api.js'

let socket = null

/** One shared connection for the whole app. */
export function getSocket() {
  if (!socket) socket = io(API_URL, { transports: ['websocket', 'polling'], withCredentials: true })
  return socket
}

export function useLiveVitals(patientId) {
  const [live, setLive] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!patientId) return undefined
    const s = getSocket()
    setLive(null)

    const subscribe = () => {
      s.emit('vitals:subscribe', { patientId }, (ack) => {
        if (ack?.snapshot) setLive(ack.snapshot)
      })
    }
    const onUpdate = (payload) => {
      if (payload.patientId === patientId) setLive(payload)
    }
    const onConnect = () => {
      setConnected(true)
      subscribe() // also re-subscribes after a reconnect
    }
    const onDisconnect = () => setConnected(false)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('vitals:update', onUpdate)
    if (s.connected) onConnect()

    return () => {
      s.emit('vitals:unsubscribe', { patientId })
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('vitals:update', onUpdate)
    }
  }, [patientId])

  return { live, connected }
}
