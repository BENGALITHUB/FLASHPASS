import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { ROLES } from '../constants/index.js';
import { Session } from '../models/Session.js';
import { endUserSessions, endSession, activeSessionsOf } from '../services/session.service.js';

/*
 * Staff account security (SRS FR-M7-07, NFR-SC-03).
 * Reset a staff member's PIN, switch an account off, and flag the demo accounts
 * that still use the PINs printed in the README / seed script.
 */

// The PINs the seed script gives the demo accounts. Anyone who has read the README knows them.
const demoPins = () => ({
  admin: [process.env.DEFAULT_ADMIN_PIN || '123456', '123456'],
  carnival_admin: ['333333'],
  cashier1: ['111111'],
  gate1: ['222222']
});
const KNOWN_PINS = new Set(['123456', '654321', '111111', '222222', '333333', '000000', '121212', '112233']);

export function pinProblem(pin) {
  const p = String(pin || '');
  if (!/^\d{6}$/.test(p)) return 'PIN must be exactly 6 digits.';
  if (/^(\d)\1{5}$/.test(p)) return 'PIN cannot be the same digit six times.';
  if ('0123456789'.includes(p) || '9876543210'.includes(p)) return 'PIN cannot be a run of digits like 123456.';
  if (KNOWN_PINS.has(p)) return 'That PIN is too common or is a demo PIN. Choose another.';
  return null;
}

const isPlatformAdmin = (u) => u.role === ROLES.SUPER_ADMIN;

// Who can manage whom: platform admin → anyone; event admin → themselves and
// the cashiers / gate volunteers of their own event
function canManage(actor, target) {
  if (isPlatformAdmin(actor)) return true;
  if (actor.role !== ROLES.EVENT_ADMIN) return false;
  if (String(actor._id) === String(target._id)) return true;
  return [ROLES.CASHIER, ROLES.GATE].includes(target.role) && target.assignedEventId === actor.assignedEventId;
}

let demoCache = null; // { at, list } so the dashboard banner doesn't re-run bcrypt every load

/**
 * POST /api/v1/admin/users/:id/pin   { newPin }   (actor's own PIN in x-admin-pin)
 */
export const resetStaffPin = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return errorResponse(res, 'Staff account not found', 'NOT_FOUND', 404);
    if (!canManage(req.user, target)) return errorResponse(res, 'You cannot change this account', 'FORBIDDEN', 403);

    const problem = pinProblem(req.body.newPin);
    if (problem) return errorResponse(res, problem, 'WEAK_PIN', 400);

    target.pinHash = await bcrypt.hash(String(req.body.newPin), 12);
    target.failedLoginAttempts = 0;
    target.lockUntil = undefined;
    await target.save();
    demoCache = null;
    // Anyone logged in with the old PIN is logged out (except the device making a change to its own PIN)
    const self = String(req.user._id) === String(target._id);
    await endUserSessions(target._id, 'PIN changed', self ? req.authSession?._id : null);

    await AuditLog.create({
      actorId: req.user._id, actorName: req.user.name || req.user.username, action: 'RESET_STAFF_PIN',
      target: `User ${target.username}`, reason: String(req.user._id) === String(target._id) ? 'Changed own PIN' : 'Admin reset PIN'
    });
    return successResponse(res, { message: `PIN changed for @${target.username}` });
  } catch (error) {
    return errorResponse(res, error.message, 'PIN_RESET_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/users/:id/active   { active: boolean }   (actor's own PIN in x-admin-pin)
 */
export const setStaffActive = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return errorResponse(res, 'Staff account not found', 'NOT_FOUND', 404);
    if (String(target._id) === String(req.user._id)) return errorResponse(res, 'You cannot switch off your own account', 'FORBIDDEN', 403);
    if (!canManage(req.user, target)) return errorResponse(res, 'You cannot change this account', 'FORBIDDEN', 403);

    target.active = Boolean(req.body.active);
    await target.save();
    if (!target.active) await endUserSessions(target._id, 'Account switched off');
    await AuditLog.create({
      actorId: req.user._id, actorName: req.user.name || req.user.username, action: target.active ? 'ENABLE_STAFF' : 'DISABLE_STAFF',
      target: `User ${target.username}`, reason: target.active ? 'Account switched on' : 'Account switched off'
    });
    return successResponse(res, { message: `@${target.username} is now ${target.active ? 'active' : 'switched off'}`, active: target.active });
  } catch (error) {
    return errorResponse(res, error.message, 'STAFF_ACTIVE_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/security/demo-pins
 * Active demo accounts (admin, carnival_admin, cashier1, gate1) still using their published PIN.
 */
export const listDemoPinAccounts = async (req, res) => {
  try {
    if (!demoCache || Date.now() - demoCache.at > 60_000) {
      const pins = demoPins();
      const users = await User.find({ username: { $in: Object.keys(pins) }, active: true });
      const list = [];
      for (const u of users) {
        for (const pin of new Set(pins[u.username])) {
          if (await u.comparePin(pin)) {
            list.push({ id: String(u._id), username: u.username, role: u.role, assignedEventId: u.assignedEventId || null });
            break;
          }
        }
      }
      demoCache = { at: Date.now(), list };
    }
    const visible = demoCache.list.filter(u => canManage(req.user, { ...u, _id: u.id }));
    return successResponse(res, { accounts: visible });
  } catch (error) {
    return errorResponse(res, error.message, 'SECURITY_CHECK_ERROR', 500);
  }
};

/** Startup warning in production when demo PINs are still active. */
export async function warnIfDemoPins() {
  if (process.env.NODE_ENV !== 'production') return;
  const pins = demoPins();
  const users = await User.find({ username: { $in: Object.keys(pins) }, active: true });
  for (const u of users) {
    for (const pin of new Set(pins[u.username])) {
      if (await u.comparePin(pin)) {
        console.warn(`[SECURITY] Account @${u.username} still uses its published demo PIN. Change it in Admin → Staff.`);
        break;
      }
    }
  }
}

/**
 * GET /api/v1/admin/users/:id/sessions
 * Devices this staff member is logged in on.
 */
export const listUserSessions = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return errorResponse(res, 'Staff account not found', 'NOT_FOUND', 404);
    if (!canManage(req.user, target)) return errorResponse(res, 'You cannot see this account', 'FORBIDDEN', 403);
    const sessions = await activeSessionsOf([target._id]);
    return successResponse(res, {
      sessions: sessions.map(s => ({
        id: s._id, device: s.device, ip: s.ip, loggedInAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt,
        current: String(s._id) === String(req.authSession?._id)
      }))
    });
  } catch (error) {
    return errorResponse(res, error.message, 'SESSIONS_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/sessions/:sessionId/end      log one device out
 * POST /api/v1/admin/users/:id/sessions/end-all   log a person out everywhere
 */
export const endOneSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session || session.revokedAt) return errorResponse(res, 'Session not found or already ended', 'NOT_FOUND', 404);
    const target = await User.findById(session.userId);
    if (!target || !canManage(req.user, target)) return errorResponse(res, 'You cannot change this account', 'FORBIDDEN', 403);
    await endSession(session._id, `Logged out by @${req.user.username}`);
    await AuditLog.create({
      actorId: req.user._id, actorName: req.user.name || req.user.username, action: 'FORCE_LOGOUT_DEVICE',
      target: `User ${target.username}`, reason: session.device
    });
    return successResponse(res, { message: `Logged @${target.username} out of ${session.device}` });
  } catch (error) {
    return errorResponse(res, error.message, 'END_SESSION_ERROR', 500);
  }
};

export const endAllUserSessions = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return errorResponse(res, 'Staff account not found', 'NOT_FOUND', 404);
    if (!canManage(req.user, target)) return errorResponse(res, 'You cannot change this account', 'FORBIDDEN', 403);
    const self = String(req.user._id) === String(target._id);
    const count = await endUserSessions(target._id, `Logged out everywhere by @${req.user.username}`, self ? req.authSession?._id : null);
    await AuditLog.create({
      actorId: req.user._id, actorName: req.user.name || req.user.username, action: 'FORCE_LOGOUT_ALL',
      target: `User ${target.username}`, reason: `${count} session(s) ended`
    });
    return successResponse(res, { message: `${count} device${count === 1 ? '' : 's'} logged out`, count });
  } catch (error) {
    return errorResponse(res, error.message, 'END_SESSIONS_ERROR', 500);
  }
};
