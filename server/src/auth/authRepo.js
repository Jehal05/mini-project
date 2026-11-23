// Database layer for login. Replaced by an in-memory fake in tests (tests/helpers/fakeAuthRepo.js).
import { User, RefreshToken } from '../models/index.js';

export const findUserByEmail = (email) => User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash').lean();
export const findUserById = (id) => User.findById(id).lean();
export const userIsActive = async (id) => Boolean(await User.exists({ _id: id, isActive: true }));
export const createUser = async (data) => (await User.create(data)).toObject();

export async function recordFailure(userId, { max, lockMs, now }) {
  const u = await User.findByIdAndUpdate(userId, { $inc: { failedLogins: 1 } }, { new: true }).lean();
  if (u && u.failedLogins >= max) await User.updateOne({ _id: userId }, { $set: { lockedUntil: new Date(now + lockMs), failedLogins: 0 } });
}
export const recordSuccess = (userId, now) => User.updateOne({ _id: userId }, { $set: { failedLogins: 0, lastLoginAt: new Date(now) }, $unset: { lockedUntil: 1 } });

export const saveRefresh = async (doc) => (await RefreshToken.create(doc)).toObject();
export const findRefresh = (tokenHash) => RefreshToken.findOne({ tokenHash }).lean();
// Marks a token as used. Returns false when it was already used (a replay).
export async function revokeRefreshOnce(id, now) {
  const r = await RefreshToken.updateOne({ _id: id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(now) } });
  return r.modifiedCount === 1;
}
export const revokeFamily = (family, now) => RefreshToken.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(now) } });
export const revokeAllForUser = (user, now) => RefreshToken.updateMany({ user, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(now) } });
export const familyIsLive = async (family) => Boolean(await RefreshToken.exists({ family, revokedAt: { $exists: false } }));
export const touchFamily = (family, now) => RefreshToken.updateMany({ family, revokedAt: { $exists: false } }, { $set: { lastActivityAt: new Date(now) } });
export const setPassword = (userId, passwordHash) => User.updateOne({ _id: userId }, { $set: { passwordHash } });
