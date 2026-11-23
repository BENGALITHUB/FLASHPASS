import express from 'express';
import { getPOSConfig, lookupToken, confirmTokenPayment, walkinSale, undoLastConfirmation, getShiftSummary, setShiftFloat, closeShift } from '../controllers/pos.controller.js';
import { authenticateStaff, requireRole } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/index.js';

const router = express.Router();

router.use(authenticateStaff);
router.use(requireRole(ROLES.CASHIER, ROLES.ADMIN));

router.get('/config', getPOSConfig);
router.get('/tokens/:tokenNo', lookupToken);
router.post('/tokens/:tokenNo/confirm', confirmTokenPayment);
router.post('/walkin', walkinSale);
router.post('/undo', undoLastConfirmation);
router.get('/shift/summary', getShiftSummary);
router.post('/shift/float', setShiftFloat);
router.post('/shift/close', closeShift);

export default router;

