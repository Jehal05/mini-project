import { Router } from 'express';
import { requireHospitalStaff } from '../middleware/requireHospitalStaff.js';
import { register, list, setStatus, crewOptions } from '../controllers/fleetController.js';

const router = Router();

router.get('/crew-options', crewOptions); // dev crew login list (404 in production)
router.post('/', requireHospitalStaff, register); // 71
router.get('/', requireHospitalStaff, list); // 71
router.patch('/:id/status', requireHospitalStaff, setStatus); // 72

export default router;
