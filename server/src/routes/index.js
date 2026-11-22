import { Router } from 'express';
import health from './health.js';
import hospitals from './hospitals.js';
import cases from './cases.js';
import demo from './demo.js';
import { pushPublicKey } from '../controllers/caseController.js';

const router = Router();

router.use('/health', health);
router.use('/hospitals', hospitals);
router.use('/cases', cases);
router.use('/demo', demo);
router.get('/push/public-key', pushPublicKey);

// Add feature routers below, one line each, so merges stay conflict-free:
// router.use('/auth', authRoutes);          // Jehal
// router.use('/patients', patientRoutes);   // Jehal
// router.use('/vitals', vitalRoutes);       // Daksh
// router.use('/emergencies', caseRoutes);   // Daksh
// router.use('/ambulances', ambulanceRoutes); // Puneet

export default router;
