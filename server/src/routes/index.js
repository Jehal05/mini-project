import { Router } from 'express';
import health from './health.js';

const router = Router();

router.use('/health', health);

// Add feature routers below, one line each, so merges stay conflict-free:
// router.use('/auth', authRoutes);          // Jehal
// router.use('/patients', patientRoutes);   // Jehal
// router.use('/vitals', vitalRoutes);       // Daksh
// router.use('/emergencies', caseRoutes);   // Daksh
// router.use('/hospitals', hospitalRoutes); // Puneet / Jehal
// router.use('/ambulances', ambulanceRoutes); // Puneet

export default router;
