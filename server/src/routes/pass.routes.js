import express from 'express';
import { getPassByOrderId, myTicketLookup } from '../controllers/pass.controller.js';
import { generalLimiter, myTicketLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/:orderId', generalLimiter, getPassByOrderId);
router.post('/my-ticket', myTicketLimiter, myTicketLookup);

export default router;

