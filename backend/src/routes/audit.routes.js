import { Router } from 'express';
import { listAuditLogs } from '../controllers/audit.controller.js';
import { protect, validate } from '../middleware/index.js';
import { auditQuerySchema } from '../utils/schemas.js';

const router = Router();
router.get('/', protect({ roles: ['central_admin'] }), validate(auditQuerySchema, 'query'), listAuditLogs);
export default router;
