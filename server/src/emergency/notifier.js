// Feature 47: contact alerts. A notifier is { email?(msg), push?(msg) }; each resolves when handed off.
// The default one only logs, so nothing real is ever sent from a demo. A real email or web-push
// provider is plugged in by passing { notifier } to attachEmergency (see docs/phase7-sos.md).
// WhatsApp is different: we cannot send it, so we build a pre-filled wa.me link the patient taps.

/** A pre-filled wa.me link. Needs a number with its country code; returns null if there are too few digits. */
export function buildWhatsAppLink(phone, text) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function alertText({ patientName, link }) {
  return `SIMULATED HealthTwin alert: ${patientName} may need urgent help (possible cardiac emergency). Live status: ${link} . This is a demonstration, not a real emergency.`
}

export function createDevNotifier({ logger = console, mailer } = {}) {
  const log = (channel) => async (msg) => {
    logger.log?.(`[emergency] (dev, nothing sent) ${channel} to ${msg.to}: ${msg.text}`)
    return { delivered: false, mode: 'dev-log' }
  }
  // With an email API set up (feature 47) contact emails really go out; web push and WhatsApp stay as before.
  const email = mailer?.live ? (msg) => mailer.send({ to: msg.to, subject: msg.subject, text: msg.text }) : log('email')
  return { email, push: log('push') }
}
