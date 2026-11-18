import { Router } from 'express';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import passportRoutes from './passport.routes.js';
import patientRoutes from './patient.routes.js';

/**
 * Jehal's API routes. Puneet's server mounts this once: `app.use('/api', apiRouter)`.
 * Teammates add their own routers beside these and protect them with `protect(...)`.
 */
const router = Router();
router.use('/auth', authRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/patients/me', patientRoutes);
router.use('/passport', passportRoutes);
export default router;
