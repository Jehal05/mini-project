// In-memory stand-in for src/auth/authRepo.js. Same single-step "update if" behaviour for refresh tokens.
import { oid } from './fakeDb.js';
export const store = { users: new Map(), tokens: [] };
let n = 5000;
export const resetAuth = () => { store.users = new Map(); store.tokens = []; };
const clone = (v) => (v == null ? v : structuredClone(v));
const sid = String;

export function addUser(over = {}) {
  const id = oid(++n);
  store.users.set(id, { _id: id, name: 'Test', email: `u${n}@x.test`, role: 'patient', isActive: true, failedLogins: 0, ...over });
  return store.users.get(id);
}
export const findUserByEmail = async (e) => clone([...store.users.values()].find((u) => u.email === String(e).toLowerCase().trim()));
export const findUserById = async (id) => clone(store.users.get(sid(id)));
export const userIsActive = async (id) => Boolean(store.users.get(sid(id))?.isActive);
export const recordFailure = async (id, { max, lockMs, now }) => {
  const u = store.users.get(sid(id)); u.failedLogins += 1;
  if (u.failedLogins >= max) { u.lockedUntil = new Date(now + lockMs); u.failedLogins = 0; }
};
export const recordSuccess = async (id, now) => { const u = store.users.get(sid(id)); u.failedLogins = 0; u.lastLoginAt = new Date(now); delete u.lockedUntil; };
export const saveRefresh = async (doc) => { const row = { _id: oid(++n), ...doc }; store.tokens.push(row); return clone(row); };
export const findRefresh = async (h) => clone(store.tokens.find((t) => t.tokenHash === h));
export const revokeRefreshOnce = async (id, now) => { const t = store.tokens.find((x) => x._id === sid(id)); if (t.revokedAt) return false; t.revokedAt = new Date(now); return true; };
export const revokeFamily = async (family, now) => { store.tokens.filter((t) => t.family === family && !t.revokedAt).forEach((t) => { t.revokedAt = new Date(now); }); };
export const revokeAllForUser = async (user, now) => { store.tokens.filter((t) => sid(t.user) === sid(user) && !t.revokedAt).forEach((t) => { t.revokedAt = new Date(now); }); };
export const familyIsLive = async (family) => store.tokens.some((t) => t.family === family && !t.revokedAt);
export const touchFamily = async (family, now) => { store.tokens.filter((t) => t.family === family && !t.revokedAt).forEach((t) => { t.lastActivityAt = new Date(now); }); };
export const setPassword = async (id, h) => { store.users.get(sid(id)).passwordHash = h; };
export const createUser = async (data) => { const id = oid(++n); store.users.set(id, { _id: id, failedLogins: 0, ...data }); return clone(store.users.get(id)); };
