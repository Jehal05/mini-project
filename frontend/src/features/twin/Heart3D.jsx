// Feature 101: the interactive 3D heart. Loaded lazily (own chunk, with three.js) so the first screen is untouched.
// Procedural geometry (no model files). It beats at the live heart rate and its colour follows the worst status.
// Drag or use the arrow keys to turn it. With reduced motion it does not beat or spin, but still turns on request.
import { useEffect, useRef } from 'react'
import { AmbientLight, CatmullRomCurve3, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, WebGLRenderer } from 'three'
import { pulse } from './twinModel.js'

// The four chambers, as points just in front of the heart (the heart's right side is on the viewer's left).
const CHAMBERS = [['RA', 'Right atrium', -1.0, 0.55, 0.55], ['LA', 'Left atrium', 0.95, 0.75, 0.45], ['RV', 'Right ventricle', -0.4, -0.2, 1.0], ['LV', 'Left ventricle', 0.55, -0.55, 0.95]]

const MUSCLE = 0xc2334a
const ARTERY = 0xc0392b
const VEIN = 0x4a6fb5

/** A rounded lump (sphere) stretched to a size, with an optional taper towards its lower end for the pointed apex. */
function lump(r, [sx, sy, sz], taper = 0) {
  const g = new SphereGeometry(r, 48, 32)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * sx
    const y = pos.getY(i) * sy
    let z = pos.getZ(i) * sz
    if (taper && y < 0) { const k = 1 + (y / (r * sy)) * taper; x *= k; z *= k }
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}
const tube = (pts, radius, segs = 40) => new TubeGeometry(new CatmullRomCurve3(pts.map(([x, y, z]) => new Vector3(x, y, z))), segs, radius, 14, false)

/** A procedural anatomical heart: ventricles with a pointed apex, both atria and auricles, the great vessels and the main coronary arteries. */
function buildHeart() {
  const group = new Group()
  const mats = []
  const add = (geometry, color, { rough = 0.5, pos = [0, 0, 0], rot = [0, 0, 0], emissive = false } = {}) => {
    const m = new MeshStandardMaterial({ color, roughness: rough, metalness: 0.03 })
    mats.push({ m, emissive })
    const mesh = new Mesh(geometry, m)
    mesh.position.set(...pos); mesh.rotation.set(...rot)
    group.add(mesh)
    return mesh
  }
  // ventricles
  add(lump(1, [0.95, 1.55, 0.85], 0.55), MUSCLE, { pos: [0.3, -0.25, -0.05], rot: [0, 0, 0.42], emissive: true })      // left: big, apex points down and to the viewer's right
  add(lump(1, [0.85, 1.2, 0.72], 0.5), 0xc4505d, { pos: [-0.35, -0.2, 0.3], rot: [0, 0, 0.3], emissive: true })        // right: lighter, wraps the front
  // atria and auricles
  add(lump(1, [0.62, 0.78, 0.6]), 0x9c3342, { pos: [-0.95, 0.5, -0.05], emissive: true })                             // right atrium
  add(lump(1, [0.7, 0.55, 0.55]), 0x9c3342, { pos: [0.5, 0.85, -0.45], emissive: true })                              // left atrium (behind)
  add(lump(1, [0.34, 0.3, 0.26]), 0xa23a49, { pos: [0.98, 0.62, 0.15], emissive: true })                              // left auricle
  add(lump(1, [0.3, 0.28, 0.26]), 0xa23a49, { pos: [-0.5, 0.95, 0.5], emissive: true })                               // right auricle
  // great vessels
  add(tube([[0.1, 0.75, 0.05], [0.1, 1.35, 0.0], [0.35, 1.8, -0.05], [0.85, 1.7, -0.2], [1.0, 1.2, -0.35]], 0.23), ARTERY, { rough: 0.35 })      // aorta and its arch
  add(tube([[-0.12, 0.7, 0.35], [-0.2, 1.3, 0.3], [-0.35, 1.7, 0.15]], 0.19), VEIN, { rough: 0.35 })                                            // pulmonary trunk
  add(tube([[-0.35, 1.7, 0.15], [-0.8, 1.8, 0.0]], 0.15), VEIN, { rough: 0.35 })                                                                // right pulmonary artery
  add(tube([[-0.35, 1.7, 0.15], [0.25, 1.65, 0.0], [0.7, 1.5, -0.05]], 0.15), VEIN, { rough: 0.35 })                                            // left pulmonary artery
  add(tube([[-1.0, 0.95, -0.05], [-1.0, 1.55, -0.05], [-1.0, 2.0, -0.05]], 0.17), VEIN, { rough: 0.35 })                                         // superior vena cava
  add(tube([[-0.95, 0.0, -0.05], [-0.95, -0.7, -0.05], [-0.95, -1.1, -0.05]], 0.17), VEIN, { rough: 0.35 })                                      // inferior vena cava
  // coronary arteries and a little fat along the groove between the ventricles
  add(tube([[0.0, 0.85, 0.55], [0.1, 0.3, 0.88], [0.3, -0.5, 0.85], [0.55, -1.15, 0.5]], 0.05), ARTERY, { rough: 0.4 })                       // left anterior descending
  add(tube([[-0.3, 0.95, 0.5], [-0.8, 0.75, 0.52], [-1.1, 0.25, 0.4], [-0.9, -0.45, 0.5]], 0.05), ARTERY, { rough: 0.4 })                  // right coronary
  group.scale.setScalar(0.92)
  group.position.y = -0.1
  return { group, mats }
}

export default function Heart3D({ bpm, color, motion, className, chambers = true }) {
  const tags = useRef([])
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
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })
    const scene = new Scene()
    const camera = new PerspectiveCamera(40, 1, 0.1, 50)
    camera.position.set(0, 0.1, 6.4)
    scene.add(new AmbientLight(0xffffff, 1.0))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 4, 5)
    scene.add(key)
    const { group: mesh, mats } = buildHeart()
    mesh.rotation.y = -0.35
    scene.add(mesh)
    // The patient's status shows as a glowing ring under the heart and a faint tint on the muscle.
    const ringMat = new MeshStandardMaterial({ color: new Color(live.current.color), emissive: new Color(live.current.color), emissiveIntensity: 0.9, roughness: 0.6 })
    const ring = new Mesh(new TorusGeometry(1.7, 0.035, 12, 96), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = -1.9
    scene.add(ring)

    const anchors = CHAMBERS.map(([, , x, y, z]) => new Vector3(x, y, z))
    const world = new Vector3()
    const centre = new Vector3()
    function placeLabels() {
      if (!tags.current.length) return
      mesh.updateMatrixWorld()
      centre.set(0, 0, 0).applyMatrix4(mesh.matrixWorld)
      anchors.forEach((a, i) => {
        const el = tags.current[i]
        if (!el) return
        world.copy(a).applyMatrix4(mesh.matrixWorld)
        const facing = world.z - centre.z > 0.2 // hide a label once its side has turned away
        world.project(camera)
        el.style.opacity = facing ? '1' : '0'
        el.style.transform = `translate(-50%, -50%) translate(${((world.x + 1) / 2) * el.parentElement.clientWidth}px, ${((1 - world.y) / 2) * el.parentElement.clientHeight}px)`
      })
    }

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
      ringMat.color.set(c); ringMat.emissive.set(c)
      for (const { m, emissive } of mats) if (emissive) { m.emissive.set(c); m.emissiveIntensity = 0.04 }
      const t = (performance.now() - t0) / 1000
      const beat = m ? pulse(t, b) : 0
      mesh.scale.setScalar(0.92 * (1 + 0.07 * beat))
      if (m) mesh.rotation.y += 0.004
      renderer.render(scene, camera)
      placeLabels()
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
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
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
      style={{ touchAction: 'pan-y', cursor: 'grab', position: 'relative', overflow: 'hidden' }}
      onPointerDown={(e) => { drag.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId) }}
      onPointerMove={(e) => { if (drag.current !== null) { api.current.turn((e.clientX - drag.current) * 0.01); drag.current = e.clientX } }}
      onPointerUp={() => { drag.current = null }}
      onKeyDown={(e) => {
        const step = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] }[e.key]
        if (step) { e.preventDefault(); api.current.turn(step[0], step[1]) }
      }}
    >
      {chambers && CHAMBERS.map(([short, name], i) => (
        <span key={short} ref={(el) => { tags.current[i] = el }} title={name} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', font: '700 11px/1 system-ui', color: 'var(--ht-fg)', background: 'var(--ht-bg-to)', border: '1px solid var(--ht-fg)', borderRadius: 6, padding: '2px 5px', opacity: 0 }}>
          <span aria-hidden="true">{short}</span><span className="sr-only">{name}</span>
        </span>
      ))}
    </div>
  )
}
