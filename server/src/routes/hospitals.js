import { Router } from 'express';
import { nearby, rank, search, capability } from '../controllers/hospitalController.js';
import { requireHospitalStaff } from '../middleware/requireHospitalStaff.js';
import { hospitalQueue, hospitalDoctors, savePushSubscription } from '../controllers/caseController.js';
import { summary } from '../controllers/fleetController.js';

const router = Router();

// Fixed paths first so they are not read as an :id.
router.get('/nearby', nearby);
router.get('/rank', rank);
router.get('/:id/capability', capability);
router.get('/:id/cases', requireHospitalStaff, hospitalQueue); // feature 62
router.get('/:id/doctors', requireHospitalStaff, hospitalDoctors);
router.get('/:id/ambulances/summary', requireHospitalStaff, summary); // 72
router.post('/:id/push-subscription', requireHospitalStaff, savePushSubscription); // feature 61
router.get('/', search);

export default router;
