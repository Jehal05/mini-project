// A stylized heart drawn in code with three.js (no model file, so no licence to track). Loaded only on capable devices.
// Rules it follows: capped at 30 frames a second, stops when the tab is hidden or scrolled out of view, scales with the
// real heart rate (lub-dub), and cleans up every GPU object on unmount. If anything fails it calls onFail so the flat heart shows.
// To use a finished .glb model instead, load it with GLTFLoader at the marked line and add it to `group`.
import { useEffect, useRef } from 'react';
import { pulseAt, beatSeconds } from '../lib/ecg.js';

export default function Heart3D({ bpm, variant = 'solid', onFail, onReady }) {
  const host = useRef(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  useEffect(() => {
    let disposed = false; let teardown = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        if (disposed || !host.current) return;
        const el = host.current;
        const holo = variant === 'holo';
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);
        renderer.domElement.setAttribute('aria-hidden', 'true');

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 100);
        camera.position.set(0, 0.4, 8);

        const skin = holo
          ? new THREE.MeshBasicMaterial({ color: 0x5fd8ff, wireframe: true, transparent: true, opacity: 0.55 })
          : new THREE.MeshPhysicalMaterial({ color: 0xb3121a, roughness: 0.4, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.35 });
        const vessel = holo ? skin : new THREE.MeshPhysicalMaterial({ color: 0xd22a2a, roughness: 0.45, clearcoat: 0.4 });

        const geos = [];
        const ball = (r, sx, sy, sz, x, y, z, rz = 0, mat = skin) => {
          const g = new THREE.SphereGeometry(r, holo ? 20 : 48, holo ? 14 : 32); geos.push(g);
          const m = new THREE.Mesh(g, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.z = rz; return m;
        };
        const tube = (pts, radius, mat = vessel) => {
          const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, radius, holo ? 8 : 16, false); geos.push(g);
          return new THREE.Mesh(g, mat);
        };

        const group = new THREE.Group();
        group.add(ball(1, 1.0, 1.45, 0.95, 0.35, -0.35, 0, -0.35));       // left ventricle
        group.add(ball(1, 0.85, 1.2, 0.8, -0.55, -0.2, 0.35, 0.25));      // right ventricle
        group.add(ball(0.55, 1, 1, 1, 0.7, 0.85, -0.45));                  // left atrium
        group.add(ball(0.55, 1, 1, 1, -0.85, 0.7, 0.1));                   // right atrium
        group.add(tube([[0.15, 0.9, 0], [0.1, 1.7, 0.1], [0.6, 2.2, 0], [1.2, 1.9, -0.1], [1.3, 1.1, -0.3]], 0.26)); // aorta
        group.add(tube([[-0.15, 0.8, 0.5], [-0.3, 1.6, 0.6], [-0.9, 2.0, 0.4]], 0.22));                              // pulmonary artery
        group.add(tube([[-1.0, 0.2, 0], [-1.05, 1.2, -0.1], [-1.0, 2.1, -0.1]], 0.2));                              // vena cava
        // GLTF hook: replace the shapes above with a loaded model here, for example group.add(gltf.scene).
        group.rotation.z = 0.18; group.position.y = -0.4;
        scene.add(group);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x330000, holo ? 0.2 : 0.75));
        const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 4, 5); scene.add(key);
        const rim = new THREE.DirectionalLight(holo ? 0x5fd8ff : 0xff3030, 1.2); rim.position.set(-4, 2, -3); scene.add(rim);

        let raf = 0; let last = 0; let visible = true; let inView = true; const t0 = performance.now();
        const draw = (now) => {
          raf = 0;
          if (disposed || document.hidden || !inView) return;       // paused: nothing is scheduled until it comes back
          raf = requestAnimationFrame(draw);
          if (now - last < 33) return;                               // about 30 frames a second
          last = now;
          const t = (now - t0) / 1000;
          const period = beatSeconds(bpmRef.current);
          group.scale.setScalar(1 + 0.05 * pulseAt((t % period) / period));
          group.rotation.y = Math.sin(t * 0.35) * 0.5;
          renderer.render(scene, camera);
        };
        const kick = () => { if (!raf && visible && !document.hidden && inView) raf = requestAnimationFrame(draw); };
        const onVis = () => kick();
        document.addEventListener('visibilitychange', onVis);
        const io = new IntersectionObserver((e) => { inView = e[0]?.isIntersecting ?? true; kick(); });
        io.observe(el);
        const ro = new ResizeObserver(() => {
          const w = el.clientWidth; const h = el.clientHeight; if (!w || !h) return;
          renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
        });
        ro.observe(el);
        const onLost = (e) => { e.preventDefault(); onFail?.(); };
        renderer.domElement.addEventListener('webglcontextlost', onLost);

        kick();
        onReady?.();
        teardown = () => {
          cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis);
          io.disconnect(); ro.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', onLost);
          geos.forEach((g) => g.dispose()); skin.dispose(); if (vessel !== skin) vessel.dispose();
          renderer.dispose(); renderer.domElement.remove();
        };
        if (disposed) teardown();
      } catch { if (!disposed) onFail?.(); }
    })();
    return () => { disposed = true; teardown(); };
  }, [variant, onFail, onReady]);

  return <div ref={host} className="h-full w-full" />;
}
