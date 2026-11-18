import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { Patient } from '../models/Patient.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { runInBackground } from '../utils/background.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { auditLabel, normalizeIdentifier } from '../utils/identifier.js';
import { attemptKey, clearAttempts, reserveAttempt } from '../utils/loginAttempts.js';
import { sendMail } from '../utils/mailer.js';
import { generatePatientId } from '../utils/patientId.js';
import { normalizePhone } from '../utils/phone.js';
import {
  clearRefreshCookie, finishSession, issueRefreshToken, loadPatient, publicUser, revokeFamily, revokeUserSessions, startSession,
} from '../utils/session.js';

// Compared against when the account does not exist, so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', config.bcryptRounds);
const REFRESH_GRACE_MS = 10_000;

/** Feature 1: patient registration. Creates user + patient record + patient ID + QR token together. */
export async function register(req, res) {
  const { fullName, email, phone, password, consent } = req.valid;

  const clash = await User.findOne({ $or: [email && { email }, phone && { phone }].filter(Boolean) }).lean();
  if (clash) throw ApiError.conflict('An account with that email or phone already exists', 'ACCOUNT_EXISTS');

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const patientId = await generatePatientId();
  const user = await User.create({ name: fullName, email, phone, passwordHash, role: 'patient', passwordChangedAt: new Date() });
  let patient;
  try {
    patient = await Patient.create({
      patientId,
      user: user._id,
      fullName,
      consent: { dataUse: true, location: consent.location, givenAt: new Date() },
      qrToken: randomToken(32),
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // no half-created accounts
    throw err;
  }

  const session = await startSession(req, res, user, { patient });
  await writeAudit({ req, actor: user._id, role: 'patient', actorLabel: email || phone, action: 'patient.register', resourceType: 'patient', resourceId: patient.patientId });
  res.status(201).json({ accessToken: session.accessToken, user: session.user });
}

/** Features 2-5: one login handler per portal, each limited to the roles that belong there. */
export const loginFor = (allowedRoles) => async (req, res) => {
  const { identifier, password } = req.valid;
  const normalized = normalizeIdentifier(identifier);
  const query = normalized.includes('@') ? { email: normalized } : normalizePhone(normalized) ? { phone: normalizePhone(normalized) } : null;
  const user = query ? await User.findOne(query).select('+passwordHash') : null;
  const key = attemptKey(user, normalized);
  const label = auditLabel(identifier);

  const fail = async (reason, locked = false) => {
    await writeAudit({ req, actor: user?._id, role: user?.role, actorLabel: label, action: 'auth.login', outcome: 'failure', meta: { reason }, hospitalId: user?.hospitalId });
    if (locked) throw ApiError.tooMany('Too many failed attempts. Try again in a few minutes.');
    throw ApiError.unauthorized('Incorrect email/phone or password', 'INVALID_CREDENTIALS');
  };

  // The attempt is counted atomically BEFORE the password is checked, and identically for real and
  // made-up accounts, so neither parallel guessing nor the lock itself reveals which accounts exist.
  if ((await reserveAttempt(key)).locked) return fail('locked', true);

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) return fail(user ? 'bad-password' : 'unknown-user');
  if (!user.isActive) return fail('inactive');
  // Right password but wrong portal: same generic message so roles cannot be probed.
  if (!allowedRoles.includes(user.role)) return fail('wrong-portal');

  await clearAttempts(key);
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const session = await startSession(req, res, user);
  await writeAudit({ req, actor: user._id, role: user.role, actorLabel: label, action: 'auth.login', hospitalId: user.hospitalId, meta: { portal: allowedRoles.join('|') } });
  res.json({ accessToken: session.accessToken, user: session.user });
};

/** Feature 100: silent refresh with rotation, reuse detection and the 30-minute idle rule. */
export async function refresh(req, res) {
  const raw = req.cookies?.[config.session.cookieName];
  const reject = (code, message, { keepCookie = false } = {}) => {
    if (!keepCookie) clearRefreshCookie(res);
    throw ApiError.unauthorized(message, code);
  };
  // Another request (a second tab) rotated this token a moment ago. The browser already holds the new
  // cookie, so keep it and let the client retry with it.
  const race = () => reject('REFRESH_RACE', 'Session was just renewed. Retry.', { keepCookie: true });

  if (!raw) return reject('NO_REFRESH_TOKEN', 'Please sign in');

  const doc = await RefreshToken.findOne({ tokenHash: sha256(raw) });
  if (!doc) return reject('INVALID_REFRESH_TOKEN', 'Please sign in again');

  if (doc.revokedAt) {
    if (!doc.replacedBy) return reject('REFRESH_TOKEN_REVOKED', 'Session ended. Please sign in again'); // logged out, idle, or reset
    if (Date.now() - doc.revokedAt.getTime() <= REFRESH_GRACE_MS) return race();
    // A token that was rotated long ago being replayed means it may have been stolen: kill the whole login.
    await revokeFamily(doc.family);
    await writeAudit({ req, actor: doc.user, action: 'auth.refresh_reuse_detected', outcome: 'denied' });
    return reject('REFRESH_TOKEN_REVOKED', 'Session ended. Please sign in again');
  }
  if (doc.expiresAt <= new Date()) return reject('REFRESH_TOKEN_EXPIRED', 'Session expired. Please sign in again');
  if (Date.now() - doc.lastActivityAt.getTime() > config.session.idleTimeoutMs) {
    await revokeFamily(doc.family);
    await writeAudit({ req, actor: doc.user, action: 'auth.session_idle_timeout' });
    return reject('SESSION_IDLE', 'You were signed out after 30 minutes of inactivity');
  }

  const user = await User.findById(doc.user);
  if (!user || !user.isActive) return reject('ACCOUNT_DISABLED', 'This account is not available');

  // The replacement is created first so the login never has a moment with no live token (which would
  // make a concurrent API call fail), then the old token is claimed atomically: only one request wins.
  const next = await issueRefreshToken(req, user, doc.family);
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: doc._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), replacedBy: next.doc._id } },
  );
  if (!claimed) {
    await RefreshToken.updateOne({ _id: next.doc._id }, { $set: { revokedAt: new Date() } });
    return race();
  }

  const session = finishSession(res, { user, patient: await loadPatient(user), raw: next.raw, doc: next.doc });
  res.json({ accessToken: session.accessToken, user: session.user });
}

/** Feature 100: logout revokes the refresh token and the rest of its login, so its access tokens stop too. */
export async function logout(req, res) {
  const raw = req.cookies?.[config.session.cookieName];
  if (raw) {
    const doc = await RefreshToken.findOne({ tokenHash: sha256(raw) });
    if (doc) {
      await revokeFamily(doc.family);
      await writeAudit({ req, actor: doc.user, action: 'auth.logout' });
    }
  }
  clearRefreshCookie(res);
  res.json({ message: 'Signed out' });
}

export async function logoutAll(req, res) {
  await revokeUserSessions(req.user.id);
  await writeAudit({ req, action: 'auth.logout_all' });
  clearRefreshCookie(res);
  res.json({ message: 'Signed out everywhere' });
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not available', 'ACCOUNT_DISABLED');
  res.json({ user: publicUser(user, await loadPatient(user)) });
}

const RESET_REPLY = { message: 'If an account exists for that email, a reset link has been sent. It expires in 15 minutes.' };

/**
 * Feature 7: single-use reset link by email, valid 15 minutes.
 * The reply goes out before any work happens, so its timing and content are identical whether or not
 * the account exists.
 */
export async function forgotPassword(req, res) {
  const { email } = req.valid;
  res.json(RESET_REPLY);

  runInBackground('forgot-password', async () => {
    const user = await User.findOne({ email, isActive: true });
    if (!user) return;
    await PasswordReset.deleteMany({ user: user._id, usedAt: { $exists: false } }); // only the newest link works
    const token = randomToken(32);
    await PasswordReset.create({ user: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + config.passwordReset.ttlMs) });
    const link = `${config.clientOrigin}/reset-password?token=${token}`;
    try {
      await sendMail({
        to: email,
        subject: 'Reset your HealthTwin AI password',
        text: `Use this link to choose a new password. It works once and expires in 15 minutes.\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
      });
    } catch (err) {
      console.error('[mail] reset email failed', err.message);
    }
    await writeAudit({ req, actor: user._id, role: user.role, actorLabel: email, action: 'auth.password_reset_requested', hospitalId: user.hospitalId });
  });
}

export async function resetPassword(req, res) {
  const { token, password } = req.valid;
  // Atomic claim makes the link single-use even under concurrent requests.
  const reset = await PasswordReset.findOneAndUpdate(
    { tokenHash: sha256(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!reset) throw new ApiError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired. Request a new one.');

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  await User.updateOne({ _id: reset.user }, { $set: { passwordHash, passwordChangedAt: new Date() } });
  const user = await User.findById(reset.user);
  await clearAttempts(attemptKey({ _id: reset.user }));
  await revokeUserSessions(reset.user); // sign out every device
  await writeAudit({ req, actor: reset.user, role: user?.role, action: 'auth.password_reset', hospitalId: user?.hospitalId });
  res.json({ message: 'Password updated. Please sign in.' });
}
