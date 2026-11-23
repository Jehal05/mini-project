import { Router } from 'express';
import { requireAmbulanceCrew, requireCrewOrHospitalStaff } from '../middleware/requireAmbulanceCrew.js';
import { publicTrip, pickup, arrive, crewTrip } from '../controllers/fleetController.js';

const router = Router();

router.get('/crew/current', requireAmbulanceCrew, crewTrip); // 107: the crew's current trip
router.get('/:caseId/public', publicTrip); // patient and family tracking (OWNER: Jehal, add patient auth)
router.post('/:caseId/pickup', requireAmbulanceCrew, pickup); // 79
router.post('/:caseId/arrive', requireCrewOrHospitalStaff, arrive); // 80

export default router;
