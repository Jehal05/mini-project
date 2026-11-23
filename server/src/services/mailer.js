// Feature 47: email goes out through an HTTP email API, set up with EMAIL_API_URL and EMAIL_API_KEY.
// Without them (the default) nothing is sent: the message is printed to the server console, so a demo never emails anyone.
import { env } from '../config/env.js';

export function createMailer({ config = env, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const live = Boolean(config.emailApiUrl && config.emailApiKey);
  return {
    live,
    async send({ to, subject, text }) {
      if (!to) return { delivered: false, mode: 'no-recipient' };
      if (!live) {
        logger.log?.(`[email] (dev, nothing sent) to ${to}: ${subject}\n${text}`);
        return { delivered: false, mode: 'dev-log' };
      }
      const res = await fetchImpl(config.emailApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.emailApiKey}` },
        body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Email service answered ${res.status}`);
      return { delivered: true, mode: 'api' };
    },
  };
}
let shared;
export const getMailer = () => (shared ??= createMailer());
