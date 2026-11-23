import { config } from '../config/env.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { randomToken, sha256 } from './crypto.js';
import { sendMail } from './mailer.js';

const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * New hospital and doctor accounts are created with a random password nobody knows, and the person gets a one-time
 * link to choose their own (the same /reset-password screen). No password is ever shown to, or chosen by, the admin.
 */
export async function inviteUser(user, { inviter, hospitalName }) {
  const token = randomToken(32);
  await PasswordReset.deleteMany({ user: user._id, usedAt: { $exists: false } });
  await PasswordReset.create({ user: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  const link = `${config.clientOrigin}/reset-password?token=${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'Your HealthTwin AI account',
      text: `${inviter} created a ${user.role.replace('_', ' ')} account for you${hospitalName ? ` at ${hospitalName}` : ''}.\n\nChoose your password here (works once, valid for 3 days):\n${link}`,
    });
    return 'sent';
  } catch (err) {
    console.error('[mail] invite failed', err.message);
    return 'failed';
  }
}
