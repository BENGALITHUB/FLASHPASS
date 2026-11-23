import { findSession, readSessionToken, endSession } from '../services/session.service.js';
import { User } from '../models/User.js';
import { errorResponse } from '../utils/response.utils.js';

/**
 * Staff authentication by server-side session (HttpOnly cookie, or a Bearer
 * session token for scripts). Tokens in the URL are not accepted: they end up
 * in browser history and server logs.
 */
export const authenticateStaff = async (req, res, next) => {
  try {
    const session = await findSession(readSessionToken(req));
    if (!session) {
      return errorResponse(res, 'Please log in again', 'UNAUTHORIZED', 401);
    }

    const user = await User.findById(session.userId);
    if (!user || !user.active) {
      await endSession(session._id, 'Account switched off');
      return errorResponse(res, 'This account is switched off', 'UNAUTHORIZED', 401);
    }

    req.user = user;
    req.authSession = session;
    next();
  } catch (err) {
    return errorResponse(res, 'Please log in again', 'UNAUTHORIZED', 401);
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(res, 'Access forbidden: Insufficient permissions', 'FORBIDDEN', 403);
    }
    next();
  };
};

export const verifyAdminPin = async (req, res, next) => {
  try {
    const pin = req.headers['x-admin-pin'] || req.body.adminPin;
    if (!pin) {
      return errorResponse(res, 'Admin PIN is required for this action', 'PIN_REQUIRED', 400);
    }

    if (!req.user) {
      return errorResponse(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    }

    const isMatch = await req.user.comparePin(String(pin));
    if (!isMatch) {
      return errorResponse(res, 'Incorrect PIN. Use the 6-digit PIN you log in with.', 'INVALID_PIN', 403);
    }

    next();
  } catch (err) {
    return errorResponse(res, 'PIN verification error', 'INTERNAL_ERROR', 500);
  }
};

