// Feature 101: the interactive 3D heart. Loaded lazily (own chunk, with three.js) so the first screen is untouched.
// Procedural geometry (no model files). It beats at the live heart rate and its colour follows the worst status.
// Drag or use the arrow keys to turn it. With reduced motion it does not beat or spin, but still turns on request.
import { useEffect, useRef } from 'react'
import { AmbientLight, Color, DirectionalLight, ExtrudeGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Shape, WebGLRenderer } from 'three'
import { pulse } from './twinModel.js'

function heartGeometry() {
  const s = new Shape()
  s.moveTo(0, -1.1)
  s.bezierCurveTo(-0.2, -0.8, -1.45, -0.2, -1.45, 0.55)
  s.bezierCurveTo(-1.45, 1.25, -0.55, 1.55, 0, 0.8)
  s.bezierCurveTo(0.55, 1.55, 1.45, 1.25, 1.45, 0.55)
  s.bezierCurveTo(1.45, -0.2, 0.2, -0.8, 0, -1.1)
  const g = new ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.4, bevelSegments: 12, curveSegments: 40 })
  g.center()
  return g
}

export default function Heart3D({ bpm, color, motion, className }) {
  const host = useRef(null)
  const live = useRef({ bpm, color, motion })
  const api = useRef({ turn: () => {}, draw: () => {} })
  live.current = { bpm, color, motion }

  useEffect(() => {
    const el = host.current
    const renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio ?? 1))
    el.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    const scene = new Scene()
    const camera = new PerspectiveCamera(40, 1, 0.1, 50)
    camera.position.set(0, 0, 6.2)
    scene.add(new AmbientLight(0xffffff, 0.7))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 4, 5)
    scene.add(key)
    const geometry = heartGeometry()
    const material = new MeshStandardMaterial({ color: new Color(live.current.color), roughness: 0.45, metalness: 0.05 })
    const mesh = new Mesh(geometry, material)
    mesh.rotation.y = 0.5
    scene.add(mesh)

    const fit = () => {
      const w = el.clientWidth || 240
      const h = el.clientHeight || 240
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { fit(); draw() }) : null
    ro?.observe(el)

    let raf = 0
    const t0 = performance.now()
    function draw() {
      const { bpm: b, color: c, motion: m } = live.current
      material.color.set(c)
      const t = (performance.now() - t0) / 1000
      const beat = m ? pulse(t, b) : 0
      mesh.scale.setScalar(1 + 0.09 * beat)
      if (m) mesh.rotation.y += 0.004
      renderer.render(scene, camera)
    }
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    if (live.current.motion) loop()
    else draw()
    // Colour or beat changes while still: redraw once. (When animating the loop already does.)
    api.current = {
      turn: (dy, dx = 0) => { mesh.rotation.y += dy; mesh.rotation.x = Math.max(-1, Math.min(1, mesh.rotation.x + dx)); if (!live.current.motion) draw() },
      draw: () => { if (!live.current.motion) draw() },
      restart: () => { cancelAnimationFrame(raf); if (live.current.motion) loop(); else draw() },
    }
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  // React to prop changes without rebuilding the scene.
  useEffect(() => {
    api.current.restart?.()
  }, [bpm, color, motion])

  // Turning: pointer drag and arrow keys.
  const drag = useRef(null)
  return (
    <div
      ref={host}
      tabIndex={0}
      role="group"
      aria-roledescription="3D model"
      aria-label="3D heart model. Use the left and right arrow keys, or drag, to turn it."
      className={className}
      style={{ touchAction: 'pan-y', cursor: 'grab' }}
      onPointerDown={(e) => { drag.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId) }}
      onPointerMove={(e) => { if (drag.current !== null) { api.current.turn((e.clientX - drag.current) * 0.01); drag.current = e.clientX } }}
      onPointerUp={() => { drag.current = null }}
      onKeyDown={(e) => {
        const step = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] }[e.key]
        if (step) { e.preventDefault(); api.current.turn(step[0], step[1]) }
      }}
    />
  )
}
