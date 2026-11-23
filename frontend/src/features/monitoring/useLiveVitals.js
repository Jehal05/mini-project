// Live vitals for one patient over Socket.IO (event vitals:update, room patient:<id>).
import { getAccessToken } from '../../api/http.js'
import { useEffect, useState } from 'react'
import { API_URL } from './api.js'

let socketPromise = null

/**
 * One shared connection for the whole app. The Socket.IO client is loaded on first
 * use rather than in the first-screen bundle (review 10): the page paints from the
 * REST snapshot first and switches to live updates a moment later.
 */
export function getSocket() {
  if (!socketPromise) {
    socketPromise = import('socket.io-client').then(({ io }) =>
      io(API_URL || undefined, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        // Read on every (re)connect so a renewed login token is used. The server rejects sockets without one.
        auth: (cb) => cb({ token: getAccessToken() }),
      }),
    )
  }
  return socketPromise
}

export function useLiveVitals(patientId) {
  const [live, setLive] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!patientId) return undefined
    setLive(null)
    let active = true
    let detach = () => {}

    getSocket().then((s) => {
      if (!active) return
      const subscribe = () => {
        s.emit('vitals:subscribe', { patientId }, (ack) => {
          if (active && ack?.snapshot) setLive(ack.snapshot)
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

      detach = () => {
        s.emit('vitals:unsubscribe', { patientId })
        s.off('connect', onConnect)
        s.off('disconnect', onDisconnect)
        s.off('vitals:update', onUpdate)
      }
    })

    return () => {
      active = false
      detach()
    }
  }, [patientId])

  return { live, connected }
}
