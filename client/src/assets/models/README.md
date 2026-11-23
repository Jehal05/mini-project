# 3D models

The heart is drawn in code (`src/ui/Heart3D.jsx`), so the project has no model file and no licence to track.

To use a finished heart model instead, put a `heart.glb` here and set `VITE_HEART_MODEL=/src/assets/models/heart.glb`.
Only use a model whose licence allows reuse in a college project (CC0, CC-BY with the credit added to this file, or one you made).
Never add a model downloaded without a clear licence. Keep it under 3 MB so a phone loads it quickly.
Loading a `.glb` also needs three's `GLTFLoader` (`three/examples/jsm/loaders/GLTFLoader.js`); the hook for it is marked in Heart3D.jsx.
