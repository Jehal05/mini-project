// Shared labels and Tailwind classes for statuses.

export const btn =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary =
  'rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'

export const LEVEL = {
  normal: { label: 'Normal', cls: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', color: '#10b981' },
  warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-800', text: 'text-amber-700', color: '#f59e0b' },
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700', text: 'text-red-600', color: '#dc2626' },
}

export const PATIENT_STATUS = {
  monitoring: { label: 'Home monitoring', cls: 'bg-slate-100 text-slate-700' },
  emergency: { label: 'Emergency', cls: 'bg-red-600 text-white' },
  'in-transit': { label: 'In ambulance', cls: 'bg-orange-100 text-orange-800' },
  admitted: { label: 'Admitted', cls: 'bg-sky-100 text-sky-800' },
}

export const ALERT_STATUS = {
  new: 'Awaiting response',
  dispatched: 'Ambulance en route',
  'at-scene': 'Paramedics on scene',
  transporting: 'Transporting to hospital',
  admitted: 'Admitted',
  dismissed: 'Dismissed',
}

export const ALERT_STEPS = ['new', 'dispatched', 'at-scene', 'transporting', 'admitted']

export const AMB_STATUS = {
  available: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700' },
  'en-route': { label: 'En route to patient', cls: 'bg-red-100 text-red-700' },
  'at-scene': { label: 'At scene', cls: 'bg-amber-100 text-amber-800' },
  transporting: { label: 'Transporting', cls: 'bg-orange-100 text-orange-800' },
}

export const PRIORITY = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
}

export const EVENT_DOT = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  info: 'bg-sky-500',
}

export function agoText(seconds) {
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`
}

export function beep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    osc.onended = () => ctx.close()
  } catch {
    // Audio not available; ignore.
  }
}
