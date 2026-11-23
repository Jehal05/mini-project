// OWNER: Jehal (authentication). TEMPORARY STUB for development.
// Real version: verify the JWT, require role "doctor", and set req.doctor = { doctorId, hospitalId, userId }
// from the token. Every doctor route reads only req.doctor, so swapping this file's export for Jehal's
// middleware needs no other change.
import { env } from '../config/env.js';
import { isObjectId } from '../utils/ids.js';

export function requireDoctor(req, res, next) {
  if (env.nodeEnv === 'production') {
    return res.status(503).json({ error: 'Doctor authentication is not wired yet' });
  }
  const doctorId = req.get('x-doctor-id');
  if (!isObjectId(doctorId)) {
    return res.status(401).json({ error: 'Doctor login required (dev stub: send an x-doctor-id header)' });
  }
  req.doctor = { doctorId };
  return next();
}
