import express from 'express';
import {
  getDashboardMetrics,
  getDashboardAnalytics,
  searchPasses,
  getAttendees,
  getPassDetail,
  forceResetPass,
  voidPass,
  updateSettings,
  getStaffUsers,
  createStaffUser,
  exportCSV,
  listEvents,
  createEvent,
  deleteEvent,
  setEventArchived,
  getPlatformOverview,
  triggerEmergencyEvacuation,
  postLiveAnnouncement,
  getExecutiveReport,
  listShifts
} from '../controllers/admin.controller.js';
import {
  listSettlements,
  getSettlement,
  recordPayout,
  voidPayout,
  createPayoutRequest,
  closePayoutRequest,
  downloadStatement
} from '../controllers/settlement.controller.js';
import { resetStaffPin, setStaffActive, listDemoPinAccounts, listUserSessions, endOneSession, endAllUserSessions } from '../controllers/staff.controller.js';
import { authenticateStaff, requireRole, verifyAdminPin } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/index.js';

const router = express.Router();

router.use(authenticateStaff);

// Both Platform Super Admin and Event Admin can access these operational endpoints
router.use(requireRole(ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN, ROLES.ADMIN));

router.get('/metrics', getDashboardMetrics);

// Organizer settlement (who sees/does what is checked inside each handler)
router.get('/settlements', listSettlements);
router.post('/settlements/payouts/:payoutId/void', requireRole(ROLES.SUPER_ADMIN), verifyAdminPin, voidPayout);
router.post('/settlements/requests/:requestId/close', closePayoutRequest);
router.get('/settlements/:eventId', getSettlement);
router.get('/settlements/:eventId/statement', downloadStatement);
router.post('/settlements/:eventId/payouts', requireRole(ROLES.SUPER_ADMIN), verifyAdminPin, recordPayout);
router.post('/settlements/:eventId/requests', requireRole(ROLES.EVENT_ADMIN), createPayoutRequest);
router.get('/analytics', getDashboardAnalytics);
router.get('/attendees', getAttendees);
router.get('/passes', searchPasses);
router.get('/passes/:id', getPassDetail);
router.post('/passes/:id/force-reset', forceResetPass);
router.post('/passes/:id/void', voidPass);
router.patch('/settings', verifyAdminPin, updateSettings);
router.get('/users', getStaffUsers);
router.post('/users', createStaffUser);
router.post('/users/:id/pin', verifyAdminPin, resetStaffPin);
router.post('/users/:id/active', verifyAdminPin, setStaffActive);
router.get('/security/demo-pins', listDemoPinAccounts);
router.get('/users/:id/sessions', listUserSessions);
router.post('/users/:id/sessions/end-all', endAllUserSessions);
router.post('/sessions/:sessionId/end', endOneSession);
router.get('/export/:type', exportCSV);
router.get('/shifts', listShifts);
router.get('/events', listEvents);

// Advanced Interactive SaaS Features
router.post('/emergency-evacuation', triggerEmergencyEvacuation);
router.post('/announcement', postLiveAnnouncement);
router.get('/executive-report', getExecutiveReport);

// Platform Super Admin only routes
router.post('/events', requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN), createEvent);
router.delete('/events/:eventId', requireRole(ROLES.SUPER_ADMIN), verifyAdminPin, deleteEvent);
router.post('/events/:eventId/archive', requireRole(ROLES.SUPER_ADMIN), verifyAdminPin, setEventArchived);
router.get('/platform/overview', requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN), getPlatformOverview);

export default router;

