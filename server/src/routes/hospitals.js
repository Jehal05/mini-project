import { Router } from 'express';
import { nearby, rank, search, capability } from '../controllers/hospitalController.js';

const router = Router();

// Fixed paths first so they are not read as an :id.
router.get('/nearby', nearby);
router.get('/rank', rank);
router.get('/:id/capability', capability);
router.get('/', search);

export default router;
