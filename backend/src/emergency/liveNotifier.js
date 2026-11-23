// Feature 47: the real channels behind the contact alerts. Email goes through the same mailer as password resets
// (Resend when MAIL_PROVIDER=resend), push through Web Push when VAPID keys are set. Anything not configured falls
// back to the dev notifier, so a demo never sends a real message by accident.
import * as webpush from 'web-push';
import { config } from '../config/env.js';
import { sendMail } from '../utils/mailer.js';
import { createDevNotifier } from './notifier.js';

export function createLiveNotifier({ env = process.env, logger = console, mail = sendMail, push = webpush } = {}) {
  const dev = createDevNotifier({ logger });
  const emailLive = config.mail.provider === 'resend' && Boolean(config.mail.resendApiKey);
  const pushLive = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (pushLive) push.setVapidDetails(env.VAPID_SUBJECT || 'mailto:alerts@healthtwin.example', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  return {
    live: { email: emailLive, push: pushLive },
    email: emailLive
      ? async ({ to, subject, text }) => { await mail({ to, subject, text }); return { delivered: true, mode: 'email' }; }
      : dev.email,
    push: pushLive
      ? async ({ to, text, link }) => {
        const subscription = typeof to === 'string' ? JSON.parse(to) : to;
        await push.sendNotification(subscription, JSON.stringify({ title: 'HealthTwin emergency alert', body: text, url: link }));
        return { delivered: true, mode: 'web-push' };
      }
      : dev.push,
  };
}
