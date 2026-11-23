// Feature 42: the sound for Level 2 and 3 alerts. Browsers only allow sound after the person has
// interacted with the page, so the audio is unlocked by their first tap or key press, and the screen
// always shows the alert too (sound is never the only signal). Muting is remembered on this device.
let ctx = null
const KEY = 'ht-alert-sound'

export const soundPref = {
  get() {
    try {
      return localStorage.getItem(KEY) !== 'off'
    } catch {
      return true
    }
  },
  set(on) {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      /* not remembered */
    }
  },
}

/** Call from a user gesture. Returns true when sound can play. */
export function unlockAudio() {
  try {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext
    if (!AC) return false
    ctx ??= new AC()
    if (ctx.state === 'suspended') ctx.resume?.()
    return true
  } catch {
    return false
  }
}

export const isUnlocked = () => Boolean(ctx && ctx.state === 'running')

/** Level 2: two beeps. Level 3: four, alternating higher and lower. Returns true if it played. */
export function playAlert(level) {
  if (!isUnlocked()) return false
  const tones = level >= 3 ? [880, 660, 880, 660] : [660, 660]
  tones.forEach((freq, i) => {
    const start = ctx.currentTime + i * 0.3
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2)
    osc.start(start)
    osc.stop(start + 0.22)
  })
  return true
}
