import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { Patient } from '../models/Patient.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../utils/audit.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { sendMail } from '../utils/mailer.js';
import { generatePatientId } from '../utils/patientId.js';
import { normalizePhone } from '../utils/phone.js';
import { clearRefreshCookie, publicUser, startSession } from '../utils/session.js';

// Compared against when the account does not exist, so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', config.bcryptRounds);

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
  const isEmail = identifier.includes('@');
  const phone = isEmail ? null : normalizePhone(identifier);
  const query = isEmail ? { email: identifier.toLowerCase() } : phone ? { phone } : null;
  const user = query ? await User.findOne(query).select('+passwordHash') : null;

  const fail = async (reason, status = 401) => {
    await writeAudit({ req, actor: user?._id, role: user?.role, actorLabel: identifier, action: 'auth.login', outcome: 'failure', meta: { reason }, hospitalId: user?.hospitalId });
    if (status === 429) throw ApiError.tooMany('Too many failed attempts. Try again in a few minutes.');
    throw ApiError.unauthorized('Incorrect email/phone or password', 'INVALID_CREDENTIALS');
  };

  if (user?.lockedUntil && user.lockedUntil > new Date()) return fail('locked', 429);

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk || !user.isActive) {
    if (user && !passwordOk) {
      const failures = user.failedLoginCount + 1;
      const lock = failures >= config.lockout.maxFailures;
      await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: lock ? 0 : failures, ...(lock && { lockedUntil: new Date(Date.now() + config.lockout.lockMs) }) } });
    }
    return fail(!user ? 'unknown-user' : !user.isActive ? 'inactive' : 'bad-password');
  }
  // Right password but wrong portal: same generic message so roles cannot be probed.
  if (!allowedRoles.includes(user.role)) return fail('wrong-portal');

  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: '' } });
  const session = await startSession(req, res, user);
  await writeAudit({ req, actor: user._id, role: user.role, actorLabel: identifier, action: 'auth.login', hospitalId: user.hospitalId, meta: { portal: allowedRoles.join('|') } });
  res.json({ accessToken: session.accessToken, user: session.user });
};

/** Feature 100: silent refresh with rotation, reuse detection and the 30-minute idle rule. */
export async function refresh(req, res) {
  const raw = req.cookies?.[config.session.cookieName];
  const reject = (code, message) => { clearRefreshCookie(res); throw ApiError.unauthorized(message, code); };
  if (!raw) return reject('NO_REFRESH_TOKEN', 'Please sign in');

  const doc = await RefreshToken.findOne({ tokenHash: sha256(raw) });
  if (!doc) return reject('INVALID_REFRESH_TOKEN', 'Please sign in again');

  if (doc.revokedAt) {
    // A token that was already rotated being replayed means it may have been stolen: kill the whole family.
    // The short grace window forgives two tabs refreshing at the same instant.
    if (Date.now() - doc.revokedAt.getTime() > 10_000) {
      await RefreshToken.updateMany({ family: doc.family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      await writeAudit({ req, actor: doc.user, action: 'auth.refresh_reuse_detected', outcome: 'denied' });
    }
    return reject('REFRESH_TOKEN_REVOKED', 'Session ended. Please sign in again');
  }
  if (doc.expiresAt <= new Date()) return reject('REFRESH_TOKEN_EXPIRED', 'Session expired. Please sign in again');
  if (Date.now() - doc.lastActivityAt.getTime() > config.session.idleTimeoutMs) {
    await RefreshToken.updateMany({ family: doc.family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    await writeAudit({ req, actor: doc.user, action: 'auth.session_idle_timeout' });
    return reject('SESSION_IDLE', 'You were signed out after 30 minutes of inactivity');
  }

  const user = await User.findById(doc.user);
  if (!user || !user.isActive) return reject('ACCOUNT_DISABLED', 'This account is not available');

  // Atomic claim: only one concurrent request can rotate this token.
  const claimed = await RefreshToken.findOneAndUpdate({ _id: doc._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  if (!claimed) return reject('REFRESH_TOKEN_REVOKED', 'Session ended. Please sign in again');

  const session = await startSession(req, res, user, { family: doc.family });
  await RefreshToken.updateOne({ _id: doc._id }, { $set: { replacedBy: session.refreshDoc._id } });
  res.json({ accessToken: session.accessToken, user: session.user });
}

/** Feature 100: logout revokes the refresh token (and the rest of its login family). */
export async function logout(req, res) {
  const raw = req.cookies?.[config.session.cookieName];
  if (raw) {
    const doc = await RefreshToken.findOne({ tokenHash: sha256(raw) });
    if (doc) {
      await RefreshToken.updateMany({ family: doc.family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      await writeAudit({ req, actor: doc.user, action: 'auth.logout' });
    }
  }
  clearRefreshCookie(res);
  res.json({ message: 'Signed out' });
}

export async function logoutAll(req, res) {
  await RefreshToken.updateMany({ user: req.user.id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  await writeAudit({ req, action: 'auth.logout_all' });
  clearRefreshCookie(res);
  res.json({ message: 'Signed out everywhere' });
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not available', 'ACCOUNT_DISABLED');
  const patient = user.role === 'patient' ? await Patient.findOne({ user: user._id }) : null;
  res.json({ user: publicUser(user, patient) });
}

const RESET_REPLY = { message: 'If an account exists for that email, a reset link has been sent. It expires in 15 minutes.' };

/** Feature 7: single-use reset link by email, valid 15 minutes. The reply never reveals if the account exists. */
export async function forgotPassword(req, res) {
  const { email } = req.valid;
  const user = await User.findOne({ email, isActive: true });
  if (user) {
    await PasswordReset.deleteMany({ user: user._id, usedAt: { $exists: false } }); // only the newest link works
    const raw = randomToken(32);
    await PasswordReset.create({ user: user._id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + config.passwordReset.ttlMs) });
    const link = `${config.clientOrigin}/reset-password?token=${raw}`;
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
  }
  res.json(RESET_REPLY);
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
  await User.updateOne(
    { _id: reset.user },
    { $set: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0 }, $unset: { lockedUntil: '' } },
  );
  const user = await User.findById(reset.user);
  await RefreshToken.updateMany({ user: reset.user, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }); // sign out every device
  await writeAudit({ req, actor: reset.user, role: user?.role, action: 'auth.password_reset', hospitalId: user?.hospitalId });
  res.json({ message: 'Password updated. Please sign in.' });
}
