// Features 47 and 61: ask the browser for permission and hand the subscription to the server.
import { api, post } from '../../api/http.js'

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** 'unsupported' | 'denied' | 'on' | 'off' */
export async function pushStatus() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** Asks permission, subscribes, and saves it with `save(subscription)`. Throws a plain message the screen can show. */
export async function enablePush(save) {
  if (!pushSupported()) throw new Error('This browser cannot receive push notifications.')
  const { enabled, publicKey } = await api('/push/public-key')
  if (!enabled) throw new Error('Push notifications are not switched on for this server.')
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Push needs the installed app build. It is not available in this development view.')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed. You can change this in the browser settings.')
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await save(sub.toJSON())
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}

export const saveStaffDevice = (subscription) => post('/push/subscribe', { subscription })
export const saveContactDevice = (token) => (subscription) => post(`/push/contact/${encodeURIComponent(token)}`, { subscription })
