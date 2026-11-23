import express from 'express';
import { staffLogin, getMe } from '../controllers/auth.controller.js';
import { authenticateStaff } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/staff-login', staffLogin);
router.get('/me', authenticateStaff, getMe);

export default router;

