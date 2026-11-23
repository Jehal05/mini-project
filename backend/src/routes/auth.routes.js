import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate, requireCsrfHeader, validate } from '../middleware/index.js';
import { limiter } from '../middleware/rateLimit.js';
import { forgotSchema, loginSchema, registerSchema, resetSchema } from '../utils/schemas.js';

const router = Router();

router.post('/register', limiter(20), validate(registerSchema), auth.register);

// One login per portal (features 2-5). Role tabs on the login page choose the endpoint.
router.post('/login/patient', limiter(30), validate(loginSchema), auth.loginFor(['patient']));
router.post('/login/doctor', limiter(30), validate(loginSchema), auth.loginFor(['doctor']));
router.post('/login/staff', limiter(30), validate(loginSchema), auth.loginFor(['hospital_staff', 'hospital_admin']));
router.post('/login/admin', limiter(30), validate(loginSchema), auth.loginFor(['central_admin']));

router.post('/refresh', requireCsrfHeader, auth.refresh);
router.post('/logout', requireCsrfHeader, auth.logout);
router.post('/logout-all', authenticate, auth.logoutAll);
router.get('/me', authenticate, auth.me);

router.post('/forgot-password', limiter(10), validate(forgotSchema), auth.forgotPassword);
router.post('/reset-password', limiter(10), validate(resetSchema), auth.resetPassword);

export default router;
