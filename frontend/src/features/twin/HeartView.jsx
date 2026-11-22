// The heart on the twin card: 3D when the browser has WebGL, a 2D (SVG) heart otherwise. Always with text.
import { lazy, Suspense, useMemo } from 'react'
import { useMotionAllowed, useTokens } from '../monitoring/useTokens.js'

const Heart3D = lazy(() => import('./Heart3D.jsx'))
const STATUS_WORD = { normal: 'normal', warning: 'warning', critical: 'critical' }

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function HeartFallback({ bpm, color, motion }) {
  const secs = bpm ? 60 / bpm : null
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <style>{`@keyframes ht-beat{0%,100%{transform:scale(1)}15%{transform:scale(1.1)}30%{transform:scale(1)}40%{transform:scale(1.06)}55%{transform:scale(1)}}`}</style>
      <path
        d="M50 86 C20 64 8 46 8 32 A20 20 0 0 1 50 24 A20 20 0 0 1 92 32 C92 46 80 64 50 86 Z"
        fill={color}
        style={{ transformOrigin: '50% 55%', animation: motion && secs ? `ht-beat ${secs}s ease-in-out infinite` : 'none' }}
      />
    </svg>
  )
}

/** live: the vitals:update payload or null. */
export function HeartView({ bpm, status, force2d = false }) {
  const tokens = useTokens()
  const motion = useMotionAllowed()
  const color = tokens[STATUS_WORD[status] ?? 'normal'] ?? tokens.normal
  const gl = useMemo(() => !force2d && webglAvailable(), [force2d])
  const alt = bpm ? `Heart model beating at ${Math.round(bpm)} beats per minute, shown in ${STATUS_WORD[status] ?? 'normal'} colour (${gl ? '3D' : '2D'}). Simulated.` : 'Heart model, no heart rate yet. Simulated.'
  return (
    <figure className="m-0 flex flex-col items-center" data-heart={gl ? '3d' : '2d'}>
      <div className="h-44 w-44 sm:h-52 sm:w-52" role={gl ? undefined : 'img'} aria-label={gl ? undefined : alt}>
        {gl ? (
          <Suspense fallback={<HeartFallback bpm={bpm} color={color} motion={false} />}>
            <Heart3D bpm={bpm} color={color} motion={motion} className="h-full w-full" />
          </Suspense>
        ) : (
          <HeartFallback bpm={bpm} color={color} motion={motion} />
        )}
      </div>
      <figcaption className="mt-1 text-center text-xs text-fg-muted">
        {bpm ? `Beating at ${Math.round(bpm)} BPM · ${STATUS_WORD[status] ?? 'normal'}` : 'Waiting for a heart rate'} · simulated
        {gl && <span className="sr-only">. {alt}</span>}
      </figcaption>
    </figure>
  )
}
