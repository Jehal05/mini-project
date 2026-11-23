import { Router } from 'express';
import { demoEmergency } from '../controllers/caseController.js';

const router = Router();

// Development only (the controller returns 404 in production).
router.post('/emergency', demoEmergency);

export default router;
