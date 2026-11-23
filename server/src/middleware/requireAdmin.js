// Admin access. Sign in through /api/auth/login/admin (central admin). Sets req.admin = { userId }.
// The old x-admin-token header (ADMIN_DEV_TOKEN) still works only in tests or with DEV_AUTH=true (never in production).
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { guard } from '../auth/guard.js';

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const requireAdmin = guard({
  label: 'Admin',
  roles: ['central_admin'],
  bind: (req, u) => { req.admin = { userId: u.id }; },
  legacy: (req, res, next) => {
    if (!env.adminDevToken) return res.status(503).json({ error: 'Set ADMIN_DEV_TOKEN in server/.env to use the admin dev login' });
    const token = req.get('x-admin-token');
    if (!token || !same(token, env.adminDevToken)) return res.status(401).json({ error: 'Admin login required (dev header: x-admin-token)' });
    req.admin = { userId: undefined, dev: true };
    return next();
  },
});
