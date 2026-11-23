import { useCallback, useEffect, useRef, useState } from 'react'
import { responseApi } from './api.js'
import { useSocketEvents } from './hooks.js'

const POLL_MS = 5000

/** The hospital's live queue (62): loaded now, refreshed on every relevant live event and every few seconds. */
export default function useIncoming() {
  const [state, setState] = useState({ items: [], loading: true, error: '', offsetMs: 0 })
  const live = useRef(true)
  const load = useCallback(async () => {
    try {
      const d = await responseApi.incoming()
      if (live.current) setState({ items: d.items ?? [], loading: false, error: '', offsetMs: (d.serverNow ? new Date(d.serverNow).getTime() : Date.now()) - Date.now() })
    } catch (e) {
      if (live.current) setState((s) => ({ ...s, loading: false, error: e.message ?? 'Could not load the queue' }))
    }
  }, [])
  useEffect(() => {
    live.current = true
    load()
    const t = setInterval(load, POLL_MS)
    return () => { live.current = false; clearInterval(t) }
  }, [load])
  useSocketEvents({
    'hospital:alert': load,
    'emergency:taken': load,
    'emergency:accepted': load,
    'emergency:cancelled': load,
    'emergency:arrived': load,
  })
  return { ...state, reload: load }
}
