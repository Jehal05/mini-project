// Web push to hospital staff whose tab is closed (feature 61). Never throws: push is a bonus on top of Socket.IO.
import { env } from '../config/env.js';
import * as repo from './caseRepo.js';

let webpush = null;
let ready = false;
let warned = false;

async function ensureReady() {
  if (ready) return true;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    if (!warned) {
      console.warn('[push] VAPID keys not set, web push is disabled');
      warned = true;
    }
    return false;
  }
  try {
    webpush = (await import('web-push')).default;
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    ready = true;
    return true;
  } catch (err) {
    if (!warned) {
      console.warn('[push] could not start web push:', err.message);
      warned = true;
    }
    return false;
  }
}

export async function pushToHospital(hospitalId, payload) {
  try {
    if (!(await ensureReady())) return { sent: 0, skipped: true };
    const subs = await repo.listSubscriptions(hospitalId);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
          sent += 1;
        } catch (err) {
          // 404 or 410 means the browser unsubscribed: clean it up.
          if (err.statusCode === 404 || err.statusCode === 410) await repo.removeSubscription(s.endpoint);
        }
      }),
    );
    return { sent };
  } catch (err) {
    console.error('[push] failed:', err.message);
    return { sent: 0, error: true };
  }
}
