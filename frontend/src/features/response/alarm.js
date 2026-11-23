// Feature 103: a two-tone alarm for the takeover screen, made with the Web Audio API (no audio file).
// Browsers only allow sound after the person has interacted with the page, so a refusal is silently ignored.
export function startAlarm() {
  let ctx
  let timer
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    let high = false
    const beep = () => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = high ? 880 : 660
      g.gain.value = 0.08
      o.connect(g)
      g.connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.35)
      high = !high
    }
    beep()
    timer = setInterval(beep, 600)
  } catch {
    /* no audio available */
  }
  return () => {
    clearInterval(timer)
    try { ctx?.close() } catch { /* already closed */ }
  }
}
