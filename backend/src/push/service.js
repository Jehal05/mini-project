// Features 47 and 61: Web Push. A browser subscribes once; after that the server can reach it with the tab closed.
//   staff     "a case needs a response" (the text never names the patient: a lock screen is not a safe place for that)
//   contacts  status updates (hospital accepted, ambulance sent, arrived, cancelled) and, on a later emergency, the alert itself
// Needs a VAPID key pair (npx web-push generate-vapid-keys). Without one it is off, the status says so, and nothing breaks.
import * as webpush from 'web-push';
import { EmergencyCase } from '../models/EmergencyCase.js';
import { Patient } from '../models/Patient.js';
import { PushSubscription } from '../models/PushSubscription.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (sub) => {
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (![endpoint, p256dh, auth].every((v) => typeof v === 'string' && v)) throw fail(400, 'That is not a push subscription');
  if (!/^https:\/\//.test(endpoint)) throw fail(400, 'A push endpoint must be https');
  return { endpoint, keys: { p256dh, auth } };
};

export function createPushService({ env = process.env, push = webpush, logger = console } = {}) {
  const publicKey = env.VAPID_PUBLIC_KEY || '';
  const enabled = Boolean(publicKey && env.VAPID_PRIVATE_KEY);
  if (enabled) push.setVapidDetails(env.VAPID_SUBJECT || 'mailto:alerts@healthtwin.example', publicKey, env.VAPID_PRIVATE_KEY);

  /** Sends to a list of stored subscriptions; a gone subscription (404/410) is deleted. Never throws. */
  async function sendTo(subs, payload) {
    if (!enabled || !subs.length) return 0;
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await push.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
        sent += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id });
        else logger.warn?.(`[push] could not send: ${err?.statusCode ?? err?.message}`);
      }
    }));
    return sent;
  }

  return {
    enabled,
    publicKey,
    sendTo,

    async subscribeStaff(user, subscription) {
      if (!user?.hospitalId) throw fail(403, 'Only hospital accounts can subscribe for case alerts');
      const data = clean(subscription);
      await PushSubscription.findOneAndUpdate({ endpoint: data.endpoint }, { $set: { ...data, kind: 'staff', user: user.id, hospital: user.hospitalId }, $unset: { patient: '', contactId: '', caseId: '' } }, { upsert: true, returnDocument: 'after' });
      return { ok: true };
    },

    /** The status link is the credential. The device is remembered for this case and for the patient's contact. */
    async subscribeContact(token, subscription) {
      const data = clean(subscription);
      const c = await EmergencyCase.findOne({ 'contactAlerts.statusLinkToken': String(token) }, { patient: 1, contactAlerts: 1 }).lean();
      const alert = c?.contactAlerts?.find((a) => a.statusLinkToken === token);
      if (!alert) throw fail(404, 'This link is not valid');
      await PushSubscription.findOneAndUpdate({ endpoint: data.endpoint }, { $set: { ...data, kind: 'contact', patient: c.patient, contactId: alert.contactId, caseId: c._id }, $unset: { user: '', hospital: '' } }, { upsert: true, returnDocument: 'after' });
      return { ok: true };
    },

    async unsubscribe(endpoint) {
      if (typeof endpoint !== 'string') throw fail(400, 'endpoint is required');
      await PushSubscription.deleteOne({ endpoint });
      return { ok: true };
    },

    /** 61: tell a hospital's subscribed staff that a case needs a response. */
    async toHospital(hospitalId, payload) {
      if (!enabled) return 0;
      return sendTo(await PushSubscription.find({ kind: 'staff', hospital: hospitalId }).lean(), { tag: 'case-alert', requireInteraction: true, ...payload });
    },

    /** 47: devices of a patient's contacts, keyed by contact id, for the first alert of a new emergency. */
    async contactDevices(patientId) {
      if (!enabled) return new Map();
      const rows = await PushSubscription.find({ kind: 'contact', patient: patientId, contactId: { $exists: true } }).lean();
      const byContact = new Map();
      for (const r of rows) byContact.set(String(r.contactId), [...(byContact.get(String(r.contactId)) ?? []), r]);
      return byContact;
    },

    /** 47, 67: status updates to every contact device of this patient (new ones from this case, saved ones from before). */
    async toContacts(caseId, payload) {
      if (!enabled) return 0;
      const c = await EmergencyCase.findById(caseId, { patient: 1 }).lean();
      if (!c) return 0;
      const live = await Patient.exists({ _id: c.patient });
      if (!live) return 0;
      const full = await EmergencyCase.findById(caseId, { contactAlerts: 1 }).lean();
      const subs = await PushSubscription.find({ kind: 'contact', patient: c.patient }).lean();
      let sent = 0;
      for (const s of subs) { // each device gets its own status link when it has one for this case
        const alert = full?.contactAlerts?.find((a) => s.contactId && String(a.contactId) === String(s.contactId));
        sent += await sendTo([s], { tag: `case-${caseId}`, ...payload, ...(alert?.statusLinkToken && { url: `/status/${alert.statusLinkToken}` }) });
      }
      return sent;
    },
  };
}
