// OWNER: Jehal (authentication). TEMPORARY STUB for development.
// Real version: verify the JWT, require role "hospital", and set req.staff = { hospitalId, userId }
// from the token. Every route that uses this middleware reads only req.staff, so swapping this
// file's export for Jehal's middleware needs no other change.
import { env } from '../config/env.js';
import { isObjectId } from '../utils/ids.js';

export function requireHospitalStaff(req, res, next) {
  if (env.nodeEnv === 'production') {
    return res.status(503).json({ error: 'Hospital authentication is not wired yet' });
  }
  const hospitalId = req.get('x-hospital-id');
  if (!isObjectId(hospitalId)) {
    return res.status(401).json({ error: 'Hospital staff login required (dev stub: send an x-hospital-id header)' });
  }
  const staffId = req.get('x-staff-id');
  req.staff = { hospitalId, userId: isObjectId(staffId) ? staffId : undefined };
  return next();
}
