// Live synthetic ECG strip drawn on a canvas at the current heart rate (feature 26).
import { useEffect, useRef } from 'react'
import { ecgSample, staticTrace } from './ecg.js'
import { useMotionAllowed, useTokens } from './useTokens.js'

const PX_PER_SECOND = 110 // sweep speed
const ERASE_PX = 18 // gap in front of the sweep, like a bedside monitor

export function EcgStrip({ bpm, status = 'normal', height = 120 }) {
  const canvasRef = useRef(null)
  const bpmRef = useRef(bpm)
  const tokens = useTokens()
  const moving = useMotionAllowed()
  const color = tokens[status] ?? tokens.normal

  bpmRef.current = bpm

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return undefined

    const dpr = window.devicePixelRatio || 1
    const yOf = (v) => height * 0.68 - v * height * 0.55
    let width = canvas.clientWidth || 600

    const drawStatic = () => {
      const pts = staticTrace(bpmRef.current, width / PX_PER_SECOND)
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.t * PX_PER_SECOND, yOf(p.y)) : ctx.moveTo(0, yOf(p.y))))
      ctx.stroke()
    }

    // Resizing a canvas resets its drawing state, so the stroke style is set here every time.
    const resize = () => {
      width = canvas.clientWidth || 600
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 6
      ctx.clearRect(0, 0, width, height)
      if (!moving) drawStatic()
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    if (!moving) return () => ro?.disconnect()

    let raf = 0
    let last = performance.now()
    let x = 0
    let phase = 0
    let prevY = yOf(0)

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const steps = Math.max(1, Math.round(dt * PX_PER_SECOND))
      for (let i = 0; i < steps; i += 1) {
        phase += (dt / steps) * ((bpmRef.current || 60) / 60)
        const nx = x + (dt * PX_PER_SECOND) / steps
        const ny = yOf(ecgSample(phase) + (Math.random() - 0.5) * 0.015)
        ctx.clearRect(x, 0, ERASE_PX, height)
        ctx.beginPath()
        ctx.moveTo(x, prevY)
        ctx.lineTo(nx, ny)
        ctx.stroke()
        x = nx
        prevY = ny
        if (x > width) {
          x = 0
          ctx.clearRect(0, 0, ERASE_PX, height)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [color, moving, height])

  return (
    <div className="ht-ecg-grid relative overflow-hidden rounded-xl border border-line bg-black/20">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Synthetic ECG waveform at ${Math.round(bpm || 0)} beats per minute (simulated, display only)`}
        style={{ width: '100%', height }}
      />
    </div>
  )
}
