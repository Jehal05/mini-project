// A slowly turning DNA helix, a quiet accent on the login page (UI/UX: "a rotating DNA strand on the login page").
// three.js loads lazily; with no WebGL, or reduced motion, it draws once and holds still. Decorative only.
import { useEffect, useRef } from 'react'
import { AmbientLight, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, CylinderGeometry, WebGLRenderer } from 'three'

const token = (name, fallback) => (typeof document === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)

export default function DnaHelix({ colorA = token('--ht-primary', 'cyan'), colorB = token('--ht-accent', 'violet'), motion = true, className }) {
  const host = useRef(null)
  useEffect(() => {
    const el = host.current
    let renderer
    try { renderer = new WebGLRenderer({ antialias: true, alpha: true }) } catch { return undefined }
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio ?? 1))
    renderer.domElement.setAttribute('aria-hidden', 'true')
    el.appendChild(renderer.domElement)
    const scene = new Scene()
    const camera = new PerspectiveCamera(35, 1, 0.1, 50)
    camera.position.set(0, 0, 9)
    scene.add(new AmbientLight(0xffffff, 0.8))
    const light = new DirectionalLight(0xffffff, 2)
    light.position.set(3, 4, 5)
    scene.add(light)

    const group = new Group()
    const ball = new SphereGeometry(0.16, 16, 12)
    const rung = new CylinderGeometry(0.035, 0.035, 1, 8)
    const mA = new MeshStandardMaterial({ color: new Color(colorA), roughness: 0.4 })
    const mB = new MeshStandardMaterial({ color: new Color(colorB), roughness: 0.4 })
    const mR = new MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 })
    const N = 22
    for (let i = 0; i < N; i++) {
      const y = (i - N / 2) * 0.32
      const a = i * 0.55
      const r = 1
      const a1 = new Mesh(ball, mA); a1.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      const b1 = new Mesh(ball, mB); b1.position.set(-Math.cos(a) * r, y, -Math.sin(a) * r)
      const link = new Mesh(rung, mR)
      link.position.set(0, y, 0)
      link.scale.set(1, 2 * r, 1)
      link.rotation.z = Math.PI / 2
      link.rotation.y = -a
      group.add(a1, b1, link)
    }
    group.rotation.z = 0.25
    scene.add(group)

    const fit = () => {
      const w = el.clientWidth || 120
      const h = el.clientHeight || 220
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(el)
    let raf = 0
    const loop = () => { group.rotation.y += 0.008; renderer.render(scene, camera); raf = requestAnimationFrame(loop) }
    if (motion) loop()
    return () => {
      cancelAnimationFrame(raf); ro?.disconnect()
      ball.dispose(); rung.dispose(); mA.dispose(); mB.dispose(); mR.dispose()
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [colorA, colorB, motion])
  return <div ref={host} className={className} aria-hidden="true" />
}
