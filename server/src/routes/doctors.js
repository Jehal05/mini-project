import { Router } from 'express';
import { requireDoctor } from '../middleware/requireDoctor.js';
import { doctorCases, doctorLogins } from '../controllers/caseController.js';

const router = Router();

// Dev-only list for the demo login picker. Declared before :id so it is not read as an id.
router.get('/dev-options', doctorLogins);
router.get('/:id/cases', requireDoctor, doctorCases);

export default router;
