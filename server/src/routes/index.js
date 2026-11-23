import { Router } from 'express';
import health from './health.js';
import hospitals from './hospitals.js';
import cases from './cases.js';
import demo from './demo.js';
import ambulances from './ambulances.js';
import trips from './trips.js';
import admin from './admin.js';
import doctors from './doctors.js';
import authRoutes from './auth.js';
import patientRoutes from './patients.js';
import passportRoutes from './passport.js';
import inpatientRoutes from './inpatient.js';
import hospitalMgmtRoutes from './hospitalMgmt.js';
import { pushPublicKey } from '../controllers/caseController.js';

const router = Router();

router.use('/health', health);
router.use('/hospitals', hospitals);
router.use('/cases', cases);
router.use('/demo', demo);
router.use('/ambulances', ambulances);
router.use('/trips', trips);
router.use('/admin', admin);
router.use('/doctors', doctors);
router.use('/auth', authRoutes);
router.use('/patients/me', patientRoutes);
router.use('/passport', passportRoutes);
router.use('/inpatient', inpatientRoutes);
router.use('/hospital', hospitalMgmtRoutes);
router.get('/push/public-key', pushPublicKey);

// Add feature routers below, one line each, so merges stay conflict-free:
// router.use('/auth', authRoutes);          // Jehal
// router.use('/vitals', vitalRoutes);       // Daksh
// router.use('/emergencies', caseRoutes);   // Daksh

export default router;
