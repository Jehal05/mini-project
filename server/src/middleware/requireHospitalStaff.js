// Hospital staff access. Sign in through /api/auth/login/staff (or /login/doctor: doctors are hospital accounts too).
// Sets req.staff = { hospitalId, userId } from the signed-in account, never from anything the request says.
// The old x-hospital-id header still works only in tests or with DEV_AUTH=true (never in production).
import { guard } from '../auth/guard.js';
import { HOSPITAL_ROLES } from '../auth/roles.js';
import { isObjectId } from '../utils/ids.js';

export const requireHospitalStaff = guard({
  label: 'Hospital staff',
  roles: HOSPITAL_ROLES,
  bind: (req, u) => { req.staff = { hospitalId: u.hospitalId, userId: u.id, role: u.role }; },
  legacy: (req, res, next) => {
    const hospitalId = req.get('x-hospital-id');
    if (!isObjectId(hospitalId)) return res.status(401).json({ error: 'Hospital staff login required (dev header: x-hospital-id)' });
    const staffId = req.get('x-staff-id');
    req.staff = { hospitalId, userId: isObjectId(staffId) ? staffId : undefined };
    return next();
  },
});
