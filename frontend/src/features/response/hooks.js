import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../monitoring/useLiveVitals.js'

/** Re-renders every `ms` so running clocks and countdowns move. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** Listens to Socket.IO events for as long as the component is mounted: useSocketEvents({ 'ambulance:position': fn }). */
export function useSocketEvents(handlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  const names = Object.keys(handlers).join('|')
  useEffect(() => {
    let active = true
    let detach = () => {}
    getSocket().then((s) => {
      if (!active) return
      const bound = Object.keys(ref.current).map((name) => [name, (p) => ref.current[name]?.(p)])
      bound.forEach(([name, fn]) => s.on(name, fn))
      detach = () => bound.forEach(([name, fn]) => s.off(name, fn))
    })
    return () => { active = false; detach() }
  }, [names])
}

export const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`
}
