// Ambulance crew access. Sign in through /api/auth/login/crew. Sets req.crew = { ambulanceId } from the account.
// The old x-ambulance-id / x-hospital-id headers still work only in tests or with DEV_AUTH=true (never in production).
import { guard } from '../auth/guard.js';
import { HOSPITAL_ROLES } from '../auth/roles.js';
import { isObjectId } from '../utils/ids.js';

export const requireAmbulanceCrew = guard({
  label: 'Ambulance crew',
  roles: ['ambulance_crew'],
  bind: (req, u) => { req.crew = { ambulanceId: u.ambulanceId, userId: u.id }; },
  legacy: (req, res, next) => {
    const ambulanceId = req.get('x-ambulance-id');
    if (!isObjectId(ambulanceId)) return res.status(401).json({ error: 'Crew login required (dev header: x-ambulance-id)' });
    req.crew = { ambulanceId };
    return next();
  },
});

// For actions the crew or the receiving hospital can do (confirm arrival).
export const requireCrewOrHospitalStaff = guard({
  label: 'Crew or hospital staff',
  roles: ['ambulance_crew', ...HOSPITAL_ROLES],
  bind: (req, u) => {
    if (u.role === 'ambulance_crew') req.crew = { ambulanceId: u.ambulanceId, userId: u.id };
    else req.staff = { hospitalId: u.hospitalId, userId: u.id, role: u.role };
  },
  legacy: (req, res, next) => {
    const ambulanceId = req.get('x-ambulance-id');
    const hospitalId = req.get('x-hospital-id');
    if (isObjectId(ambulanceId)) req.crew = { ambulanceId };
    if (isObjectId(hospitalId)) req.staff = { hospitalId, userId: undefined };
    if (!req.crew && !req.staff) return res.status(401).json({ error: 'Crew or hospital staff login required (dev headers: x-ambulance-id or x-hospital-id)' });
    return next();
  },
});
