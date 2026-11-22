import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { analyticsSummary } from '../controllers/adminController.js';

const router = Router();
router.use(requireAdmin); // OWNER: Jehal swaps this for real admin auth

router.get('/analytics/summary', analyticsSummary); // 96

export default router;
