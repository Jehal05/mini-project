import { useEffect, useState } from 'react'

/** A value that changes every `ms` while `active`, so a component re-renders to redraw a countdown. */
export function useTick(ms = 250, active = true) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms, active])
}
