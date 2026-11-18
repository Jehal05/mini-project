import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function signAccessToken({ user, patientId, session }) {
  return jwt.sign(
    {
      role: user.role,
      // Hospital roles carry hospitalId so every route can scope data to one hospital (feature 5/6).
      hospitalId: user.hospitalId ? String(user.hospitalId) : undefined,
      patientId: patientId ? String(patientId) : undefined,
      sid: String(session._id), // this refresh-token row (activity tracking)
      fam: session.family, // the login it belongs to; revoking the family ends the access token too
    },
    config.jwt.accessSecret,
    { subject: String(user._id), expiresIn: config.jwt.accessTtl, issuer: config.jwt.issuer, algorithm: 'HS256' },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithms: ['HS256'] });
}
