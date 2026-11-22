// OWNER: Jehal (authentication). TEMPORARY STUB for development.
// Real version: verify the JWT, require role "admin", and set req.admin = { userId }.
// Dev stub: send the header x-admin-token with the value of ADMIN_DEV_TOKEN. With no ADMIN_DEV_TOKEN set, nobody gets in.
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function requireAdmin(req, res, next) {
  if (env.nodeEnv === 'production') return res.status(503).json({ error: 'Admin authentication is not wired yet' });
  if (!env.adminDevToken) return res.status(503).json({ error: 'Set ADMIN_DEV_TOKEN in server/.env to use the admin dev login' });
  const token = req.get('x-admin-token');
  if (!token || !same(token, env.adminDevToken)) return res.status(401).json({ error: 'Admin login required (dev stub: send an x-admin-token header)' });
  req.admin = { userId: undefined, dev: true };
  return next();
}
