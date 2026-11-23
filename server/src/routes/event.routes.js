import express from 'express';
import { getEventInfo, getAllPublicEvents, getPublicStats } from '../controllers/event.controller.js';
import { generalLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/all', generalLimiter, getAllPublicEvents);
router.get('/stats', generalLimiter, getPublicStats);
router.get('/', generalLimiter, getEventInfo);

export default router;

