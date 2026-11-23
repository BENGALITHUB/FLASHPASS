import express from 'express';
import { staffLogin, staffLogout, getMe } from '../controllers/auth.controller.js';
import { authenticateStaff } from '../middleware/auth.middleware.js';
import { staffLoginLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.post('/staff-login', staffLoginLimiter, staffLogin);
router.post('/logout', staffLogout);
router.get('/me', authenticateStaff, getMe);

export default router;
