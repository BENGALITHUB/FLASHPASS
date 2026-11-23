import express from 'express';
import {
  scanPass,
  getGateStats,
  helpdeskSearchPasses,
  helpdeskReissuePass,
  claimAddOnVoucher
} from '../controllers/gate.controller.js';
import { authenticateStaff, requireRole } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/index.js';

const router = express.Router();

router.use(authenticateStaff);

// Standard gate scanning (Gate volunteers, Admins)
router.post('/scan', requireRole(ROLES.GATE, ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), scanPass);
router.get('/stats', getGateStats);

// Helpdesk & Kiosk Mode (Gate volunteers, Cashiers, Admins)
router.get('/helpdesk/search', requireRole(ROLES.GATE, ROLES.CASHIER, ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), helpdeskSearchPasses);
router.post('/helpdesk/reissue', requireRole(ROLES.GATE, ROLES.CASHIER, ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), helpdeskReissuePass);

// Merch & Food Add-on Redemption (Cashiers, Gate volunteers, Admins)
router.post('/merch/claim', requireRole(ROLES.GATE, ROLES.CASHIER, ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), claimAddOnVoucher);

export default router;

