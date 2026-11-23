import express from 'express';
import {
  createInquiry,
  getInquiries,
  updateInquiryStatus,
  markInquiriesAsRead,
  deleteInquiry,
  markCommissionPaid,
  setCommissionRate
} from '../controllers/inquiry.controller.js';
import { authenticateStaff, requireRole, verifyAdminPin } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/index.js';

const router = express.Router();

// Public inquiry submission from Landing Page
router.post('/', createInquiry);

// Protected Admin Inquiry Management (Super Admin & Event Admin)
router.get('/', authenticateStaff, requireRole(ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), getInquiries);
router.patch('/mark-read', authenticateStaff, requireRole(ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), markInquiriesAsRead);
// Platform commission on closed sponsor/stall deals (FlashPass super admin only)
router.patch('/commission-rate', authenticateStaff, requireRole(ROLES.SUPER_ADMIN), verifyAdminPin, setCommissionRate);
router.patch('/:id/commission-paid', authenticateStaff, requireRole(ROLES.SUPER_ADMIN), markCommissionPaid);
router.patch('/:id/status', authenticateStaff, requireRole(ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), updateInquiryStatus);
router.delete('/:id', authenticateStaff, requireRole(ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN), deleteInquiry);

export default router;

