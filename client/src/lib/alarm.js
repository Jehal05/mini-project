// Alarm for the takeover screen (feature 103), made with the Web Audio API so no sound file is needed.
// Browsers only allow sound after the user has interacted with the page once.
let ctx = null;
let timer = null;

function beep() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.value = 0.15;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

export function startAlarm() {
  if (timer) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    beep();
    timer = setInterval(beep, 800);
  } catch {
    /* sound not available, the red screen still shows */
  }
}

export function stopAlarm() {
  if (timer) clearInterval(timer);
  timer = null;
}
