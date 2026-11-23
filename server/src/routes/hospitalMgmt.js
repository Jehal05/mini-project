import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { authenticate } from '../auth/guard.js';
import * as svc from '../hospitalmgmt/service.js';
import { validateBay, validateBayAction, validateDoctorCreate, validateDoctorUpdate, validateHistoryQuery, validateProfile } from '../hospitalmgmt/validate.js';

// The hospital's own management screens. The hospital id comes from the token, never from the URL.
const router = Router();
router.param('id', (_req, _res, next, v) => (/^[a-f\d]{24}$/i.test(v) ? next() : next(httpError(404, 'Not found'))));

const only = (...roles) => (req, _res, next) => (roles.includes(req.user.role) ? next() : next(Object.assign(httpError(403, 'Your role cannot do this'), { code: 'ROLE_FORBIDDEN' })));
const admin = only('hospital_admin');
const staff = only('hospital_staff', 'hospital_admin');
const clinical = only('doctor', 'hospital_staff', 'hospital_admin');
router.use(authenticate, only('doctor', 'hospital_staff', 'hospital_admin'));

const send = (fn, status = 200) => asyncHandler(async (req, res) => res.status(status).json(await fn(req)));

router.get('/me', send((req) => svc.getProfile(req.user).then((hospital) => ({ hospital }))));
router.patch('/me', admin, send((req) => svc.updateProfile(req.user, validateProfile(req.body)).then((hospital) => ({ hospital }))));
router.get('/dashboard', send((req) => svc.dashboard(req.user)));

router.get('/doctors', send((req) => svc.listDoctors(req.user).then((doctors) => ({ doctors }))));
router.post('/doctors', admin, send((req) => svc.addDoctor(req.user, validateDoctorCreate(req.body)).then((doctor) => ({ doctor })), 201));
router.patch('/doctors/:id', admin, send((req) => svc.changeDoctor(req.user, req.params.id, validateDoctorUpdate(req.body)).then((doctor) => ({ doctor }))));

router.get('/ed', send((req) => svc.edBoard(req.user)));
router.post('/ed/bays', staff, send((req) => svc.addBay(req.user, validateBay(req.body)), 201));
router.patch('/ed/bays/:id', clinical, send((req) => svc.bayAction(req.user, req.params.id, validateBayAction(req.body))));
router.delete('/ed/bays/:id', staff, send((req) => svc.removeBay(req.user, req.params.id)));

router.get('/history', send((req) => svc.history(req.user, validateHistoryQuery(req.query))));

export default router;
