import { Router } from 'express';
import * as c from '../controllers/adminHospitals.controller.js';
import { protect, validate } from '../middleware/index.js';
import { ApiError } from '../utils/ApiError.js';
import { hospitalCreateSchema, hospitalUpdateSchema } from '../utils/hospitalSchemas.js';

/** Central Admin API, mounted at /api/admin. Central admins only. */
const router = Router();
router.param('id', (_req, _res, next, v) => (/^[a-f\d]{24}$/i.test(v) ? next() : next(ApiError.notFound('Not found'))));
router.use(protect({ roles: ['central_admin'] }));

router.get('/hospitals', c.listHospitals);
router.post('/hospitals', validate(hospitalCreateSchema), c.createHospital);
router.get('/hospitals/:id', c.getHospital);
router.patch('/hospitals/:id', validate(hospitalUpdateSchema), c.updateHospital);

export default router;
