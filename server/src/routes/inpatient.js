import { Router } from 'express';
import { sendFile } from './fileResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { authenticate } from '../auth/guard.js';
import * as svc from '../inpatient/service.js';
import { validateAdmit, validateBed, validateBedState, validateDischarge, validateNote, validatePrescription } from '../inpatient/validate.js';

// Inpatient care for the caller's own hospital. The hospital id comes from the token, never from the URL.
const router = Router();
for (const name of ['id', 'recordId']) router.param(name, (_req, _res, next, v) => (/^[a-f\d]{24}$/i.test(v) ? next() : next(httpError(404, 'Not found'))));

const only = (...roles) => (req, _res, next) => (roles.includes(req.user.role) ? next() : next(Object.assign(httpError(403, 'Your role cannot do this'), { code: 'ROLE_FORBIDDEN' })));
const staff = only('hospital_staff', 'hospital_admin');
const doctor = only('doctor');
const clinical = only('doctor', 'hospital_staff');
router.use(authenticate, only('doctor', 'hospital_staff', 'hospital_admin'));

const send = (fn, status = 200) => asyncHandler(async (req, res) => res.status(status).json(await fn(req)));

router.get('/doctors', send((req) => svc.listDoctors(req.user).then((doctors) => ({ doctors }))));
router.get('/beds', send((req) => svc.listBeds(req.user)));
router.post('/beds', staff, send((req) => svc.addBed(req.user, validateBed(req.body)).then((bed) => ({ bed })), 201));
router.patch('/beds/:id', staff, send((req) => svc.setBedState(req.user, req.params.id, validateBedState(req.body).status).then((bed) => ({ bed }))));
router.delete('/beds/:id', staff, send((req) => svc.removeBed(req.user, req.params.id)));

router.get('/admissions', send((req) => svc.listAdmissions(req.user, req.query.status).then((admissions) => ({ admissions }))));
router.post('/admissions', staff, send((req) => svc.admit(req.user, validateAdmit(req.body)).then((admission) => ({ admission })), 201));
router.get('/admissions/:id', send((req) => svc.getAdmission(req.user, req.params.id).then((admission) => ({ admission }))));

router.get('/admissions/:id/records', send((req) => svc.listRecords(req.user, req.params.id).then((records) => ({ records }))));
router.post('/admissions/:id/records', clinical, send((req) => svc.addRecord(req.user, req.params.id, validateNote(req.body)).then((record) => ({ record })), 201));

router.post('/admissions/:id/records/file', clinical, send((req) => svc.addRecordFile(req.user, req.params.id, req.body).then((record) => ({ record })), 201));
router.get('/admissions/:id/records/:recordId/file', asyncHandler(async (req, res) => sendFile(res, await svc.getRecordFile(req.user, req.params.id, req.params.recordId))));

router.get('/admissions/:id/prescriptions', send((req) => svc.listPrescriptions(req.user, req.params.id).then((prescriptions) => ({ prescriptions }))));
router.get('/admissions/:id/prescriptions/check', doctor, send((req) => svc.checkAllergy(req.user, req.params.id, req.query.drug)));
router.post('/admissions/:id/prescriptions', doctor, send((req) => svc.prescribe(req.user, req.params.id, validatePrescription(req.body)).then((prescription) => ({ prescription })), 201));

router.get('/admissions/:id/discharge', send((req) => svc.getDischarge(req.user, req.params.id)));
router.post('/admissions/:id/discharge', doctor, send((req) => svc.finalizeDischarge(req.user, req.params.id, validateDischarge(req.body))));

export default router;
