import { config } from '../config/env.js';

/** In console mode (development/test) messages are printed and kept here so tests can read them. */
export const outbox = [];

export async function sendMail({ to, subject, text }) {
  if (config.mail.provider === 'resend' && config.mail.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Email API responded ${res.status}`);
    return;
  }
  // Development fallback (feature 7): the reset link prints to the console.
  outbox.push({ to, subject, text });
  if (outbox.length > 50) outbox.shift();
  if (!config.isTest) console.log(`\n[mail:console] To: ${to}\nSubject: ${subject}\n${text}\n`);
}
