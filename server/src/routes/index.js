import { Router } from 'express';
import health from './health.js';
import hospitals from './hospitals.js';

const router = Router();

router.use('/health', health);
router.use('/hospitals', hospitals);

// Add feature routers below, one line each, so merges stay conflict-free:
// router.use('/auth', authRoutes);          // Jehal
// router.use('/patients', patientRoutes);   // Jehal
// router.use('/vitals', vitalRoutes);       // Daksh
// router.use('/emergencies', caseRoutes);   // Daksh
// router.use('/ambulances', ambulanceRoutes); // Puneet

export default router;
