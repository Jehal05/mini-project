// Reads the design-system colours from CSS variables, so canvas and chart
// drawings use the same tokens as everything else and follow the theme.
import { useEffect, useState } from 'react'
import { useTheme } from '../../design/index.js'

const NAMES = ['primary', 'accent', 'normal', 'warning', 'critical', 'fg', 'fg-muted', 'line']

function read() {
  const css = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const out = {}
  for (const n of NAMES) out[n] = css?.getPropertyValue(`--ht-${n}`).trim() || 'currentColor'
  return out
}

export function useTokens() {
  const { theme } = useTheme()
  const [tokens, setTokens] = useState(read)
  useEffect(() => {
    setTokens(read())
  }, [theme])
  return tokens
}

/** True when the user asked for less motion, or paused motion in the app. */
export function useMotionAllowed() {
  const { motionPaused } = useTheme()
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return !reduced && !motionPaused
}
