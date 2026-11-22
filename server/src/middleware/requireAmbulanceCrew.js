// OWNER: Jehal (authentication). TEMPORARY STUBS for development, like requireHospitalStaff.
// Real version: verify the crew login token and set req.crew = { ambulanceId }.
import { env } from '../config/env.js';
import { isObjectId } from '../utils/ids.js';

const notWired = (res) => res.status(503).json({ error: 'Ambulance crew authentication is not wired yet' });

export function requireAmbulanceCrew(req, res, next) {
  if (env.nodeEnv === 'production') return notWired(res);
  const ambulanceId = req.get('x-ambulance-id');
  if (!isObjectId(ambulanceId)) {
    return res.status(401).json({ error: 'Crew login required (dev stub: send an x-ambulance-id header)' });
  }
  req.crew = { ambulanceId };
  return next();
}

// For actions the crew or the receiving hospital can do (confirm arrival).
export function requireCrewOrHospitalStaff(req, res, next) {
  if (env.nodeEnv === 'production') return notWired(res);
  const ambulanceId = req.get('x-ambulance-id');
  const hospitalId = req.get('x-hospital-id');
  if (isObjectId(ambulanceId)) req.crew = { ambulanceId };
  if (isObjectId(hospitalId)) req.staff = { hospitalId, userId: undefined };
  if (!req.crew && !req.staff) {
    return res.status(401).json({ error: 'Crew or hospital staff login required (dev stub headers: x-ambulance-id or x-hospital-id)' });
  }
  return next();
}
