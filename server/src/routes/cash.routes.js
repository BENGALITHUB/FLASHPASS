import express from 'express';
import { createCashToken, getCashTokenStatus } from '../controllers/cash.controller.js';
import { cashTokenLimiter, generalLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.post('/', cashTokenLimiter, createCashToken);
router.get('/:id', generalLimiter, getCashTokenStatus);

export default router;

