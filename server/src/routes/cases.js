import { Router } from 'express';
import { requireHospitalStaff } from '../middleware/requireHospitalStaff.js';
import * as c from '../controllers/caseController.js';

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

export default router;
