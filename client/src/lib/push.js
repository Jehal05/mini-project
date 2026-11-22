import { portalFetch } from './portalApi.js';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Feature 61: lets staff get alerts even when the tab is closed. Returns a short message for the screen.
export async function enableBackgroundAlerts(hospitalId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'This browser does not support background alerts.';
  const { publicKey } = await (await fetch('/api/push/public-key')).json();
  if (!publicKey) return 'Background alerts are not set up on the server yet (no VAPID keys).';
  if ((await Notification.requestPermission()) !== 'granted') return 'Notification permission was not granted.';

  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await portalFetch(hospitalId, `/hospitals/${hospitalId}/push-subscription`, { method: 'POST', body: sub.toJSON() });
  return 'Background alerts are on for this browser.';
}
