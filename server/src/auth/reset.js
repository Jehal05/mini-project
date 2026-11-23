// Feature 7: forgot password. A single-use link, valid 15 minutes, sent by email (printed to the console in development).
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import * as repo from './authRepo.js';
import { randomToken, sha256 } from './tokens.js';
import { hashPassword, passwordProblems } from './password.js';
import { getMailer } from '../services/mailer.js';

/** Always answers the same, so the form cannot be used to find out which emails have accounts. */
export async function requestReset(email, { mailer = getMailer(), now = Date.now(), logger = console } = {}) {
  const user = typeof email === 'string' ? await repo.findUserByEmail(email) : null;
  if (!user || !user.isActive) return;
  await repo.invalidateResets(user._id, now); // an older link stops working
  const raw = randomToken();
  await repo.saveReset({ user: user._id, tokenHash: sha256(raw), expiresAt: new Date(now + env.resetTtlMinutes * 60000) });
  const link = `${env.clientUrl}/?reset=${raw}`;
  try {
    await mailer.send({ to: user.email, subject: 'Reset your HealthTwin AI password', text: `Open this link to choose a new password. It works once and expires in ${env.resetTtlMinutes} minutes.\n${link}\n\nIf you did not ask for this, ignore this email. Simulated demo, not a medical device.` });
    if (!mailer.live) logger.log?.(`[reset] link for ${user.email}: ${link}`);
  } catch (e) { logger.error?.('[reset] email failed', e.message); }
}

export async function completeReset(rawToken, password, { now = Date.now() } = {}) {
  const problems = passwordProblems(password);
  if (problems.length) throw httpError(400, problems.join(' '));
  const userId = typeof rawToken === 'string' && rawToken.length >= 20 ? await repo.consumeReset(sha256(rawToken), now) : null;
  if (!userId) throw Object.assign(httpError(400, 'This link has expired or was already used. Ask for a new one.'), { code: 'RESET_INVALID' });
  await repo.setPassword(userId, await hashPassword(password));
  await repo.clearLock(userId);
  await repo.revokeAllForUser(userId, now); // every old login must sign in again
}
