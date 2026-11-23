// Doctor access. Sign in through /api/auth/login/doctor. Sets req.doctor = { doctorId, hospitalId, userId }.
// The old x-doctor-id header still works only in tests or with DEV_AUTH=true (never in production).
import { guard } from '../auth/guard.js';
import { isObjectId } from '../utils/ids.js';

export const requireDoctor = guard({
  label: 'Doctor',
  roles: ['doctor'],
  bind: (req, u) => { req.doctor = { doctorId: u.doctorId, hospitalId: u.hospitalId, userId: u.id }; },
  legacy: (req, res, next) => {
    const doctorId = req.get('x-doctor-id');
    if (!isObjectId(doctorId)) return res.status(401).json({ error: 'Doctor login required (dev header: x-doctor-id)' });
    req.doctor = { doctorId };
    return next();
  },
});
