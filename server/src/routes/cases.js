import { Router } from 'express';
import { requireHospitalStaff } from '../middleware/requireHospitalStaff.js';
import * as c from '../controllers/caseController.js';
import { options, override, dispatch, staffTrip } from '../controllers/fleetController.js';

const router = Router();
router.use(requireHospitalStaff);

router.get('/:caseId', c.detail);
router.get('/:caseId/patient', c.patientInfo); // feature 63 (audited)
router.get('/:caseId/timeline', c.timeline); // feature 70
router.post('/:caseId/accept', c.accept); // features 65, 67
router.post('/:caseId/reject', c.reject); // feature 66
router.post('/:caseId/doctor', c.doctor); // feature 68
router.patch('/:caseId/preparation', c.preparation); // feature 69
router.post('/:caseId/milestones', c.milestone); // feature 105
router.get('/:caseId/ambulance-options', options); // 73
router.post('/:caseId/ambulance', override); // 73 manual override
router.post('/:caseId/dispatch', dispatch); // 74
router.get('/:caseId/trip', staffTrip); // 75-78

export default router;
