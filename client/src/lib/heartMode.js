// Decides whether to draw the 3D heart. A phone that is low on power, has no WebGL, wants less motion,
// or asked to save data gets the flat illustration instead. Pure, so it can be tested.
export function shouldUse3D({ reducedMotion = false, webgl = false, cores, memory, saveData = false } = {}) {
  if (reducedMotion || !webgl || saveData) return false;
  if (typeof cores === 'number' && cores < 4) return false;
  if (typeof memory === 'number' && memory < 4) return false;
  return true;
}

/** Reads the real device. Kept apart from the pure rule above. */
export function detectCapabilities(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return { webgl: false };
  let webgl = false;
  try { const c = win.document.createElement('canvas'); webgl = Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { webgl = false; }
  return {
    webgl,
    reducedMotion: Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    cores: win.navigator?.hardwareConcurrency,
    memory: win.navigator?.deviceMemory,
    saveData: Boolean(win.navigator?.connection?.saveData),
  };
}
