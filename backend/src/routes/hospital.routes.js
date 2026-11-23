import { Router } from 'express';
import * as adm from '../controllers/admission.controller.js';
import * as h from '../controllers/hospital.controller.js';
import { authorize, protect, validate } from '../middleware/index.js';
import { uploadDocument } from '../middleware/upload.js';
import { ApiError } from '../utils/ApiError.js';
import * as s from '../utils/hospitalSchemas.js';

/**
 * Hospital portal API, mounted at /api/hospital. Every route is scoped to the caller's own hospital:
 * handlers use req.hospitalId (from the token) and never an id from the request.
 */
const router = Router();
const ID = /^[a-f\d]{24}$/i;
for (const name of ['id', 'recordId']) router.param(name, (_req, _res, next, v) => (ID.test(v) ? next() : next(ApiError.notFound('Not found'))));

router.use(protect({ roles: ['doctor', 'hospital_staff', 'hospital_admin'], hospitalScoped: true }));
const admin = authorize('hospital_admin');
const staff = authorize('hospital_staff', 'hospital_admin');
const doctor = authorize('doctor');
const clinical = authorize('doctor', 'hospital_staff');

router.get('/me', h.getMyHospital);
router.patch('/me', admin, validate(s.ownHospitalUpdateSchema), h.updateMyHospital);
router.get('/dashboard', h.dashboard);

router.get('/doctors', h.listDoctors);
router.post('/doctors', admin, validate(s.doctorCreateSchema), h.createDoctor);
router.patch('/doctors/:id', admin, validate(s.doctorUpdateSchema), h.updateDoctor);

router.get('/beds', h.listBeds);
router.post('/beds', staff, validate(s.bedCreateSchema), h.createBed);
router.post('/beds/bulk', staff, validate(s.bedBulkSchema), h.createBeds);
router.patch('/beds/:id', staff, validate(s.bedStatusSchema), h.setBedStatus);
router.delete('/beds/:id', staff, h.deleteBed);

router.get('/ed', h.edBoard);
router.post('/ed/bays', staff, validate(s.edBayCreateSchema), h.createBay);
router.patch('/ed/bays/:id', authorize('doctor', 'hospital_staff', 'hospital_admin'), validate(s.edBayActionSchema), h.bayAction);
router.delete('/ed/bays/:id', staff, h.deleteBay);

router.get('/history', validate(s.historyQuerySchema, 'query'), h.history);

router.get('/admissions', adm.listAdmissions);
router.post('/admissions', staff, validate(s.admissionCreateSchema), adm.admit);
router.get('/admissions/:id', adm.getAdmission);
router.get('/admissions/:id/record', adm.patientRecord);
router.get('/admissions/:id/summary', adm.healthSummary);

router.get('/admissions/:id/records', adm.listRecords);
router.post('/admissions/:id/records', clinical, validate(s.visitRecordSchema), adm.addRecord);
router.post('/admissions/:id/records/file', clinical, uploadDocument, adm.addRecordFile);
router.get('/admissions/:id/records/:recordId/file', adm.recordFile);

router.get('/admissions/:id/prescriptions', adm.listPrescriptions);
router.get('/admissions/:id/prescriptions/check', doctor, adm.checkAllergy);
router.post('/admissions/:id/prescriptions', doctor, validate(s.prescriptionSchema), adm.prescribe);

router.get('/admissions/:id/discharge', adm.getDischarge);
router.post('/admissions/:id/discharge', doctor, validate(s.dischargeSchema), adm.finalizeDischarge);

export default router;
