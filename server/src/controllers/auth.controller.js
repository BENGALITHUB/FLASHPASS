import { User } from '../models/User.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import {
  createSession, endSession, findSession, readSessionToken, setSessionCookie, clearSessionCookie
} from '../services/session.service.js';

const publicUser = (user) => ({
  id: user._id,
  username: user.username,
  name: user.name,
  role: user.role,
  assignedEventId: user.assignedEventId || null
});

/**
 * POST /api/v1/auth/staff-login  { username, pin }
 * Starts a session and sets it as an HttpOnly cookie. The token is never
 * given to page scripts.
 */
export const staffLogin = async (req, res) => {
  try {
    const { username, pin } = req.body;

    if (!username || !pin) {
      return errorResponse(res, 'Please enter username and 6-digit PIN', 'MISSING_CREDENTIALS', 400);
    }

    const user = await User.findOne({ username: String(username).toLowerCase().trim() });
    if (!user || !user.active) {
      return errorResponse(res, 'Invalid credentials or inactive account', 'AUTH_FAILED', 401);
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const waitMinutes = Math.ceil((user.lockUntil - new Date()) / (60 * 1000));
      return errorResponse(res, `Account locked due to multiple failed tries. Please wait ${waitMinutes} minutes.`, 'ACCOUNT_LOCKED', 403);
    }

    const isMatch = await user.comparePin(String(pin));
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return errorResponse(res, 'Incorrect PIN. Please try again.', 'INVALID_PIN', 401);
    }

    // Successful login: reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    const { token, session } = await createSession(user, req);
    setSessionCookie(res, token, session);

    return successResponse(res, { user: publicUser(user), expiresAt: session.expiresAt });
  } catch (error) {
    return errorResponse(res, error.message, 'LOGIN_ERROR', 500);
  }
};

/**
 * POST /api/v1/auth/logout
 * Ends this device's session on the server and clears the cookie.
 */
export const staffLogout = async (req, res) => {
  try {
    const session = await findSession(readSessionToken(req));
    if (session) await endSession(session._id, 'Logged out');
    clearSessionCookie(res);
    return successResponse(res, { message: 'Logged out' });
  } catch (error) {
    clearSessionCookie(res);
    return errorResponse(res, error.message, 'LOGOUT_ERROR', 500);
  }
};

export const getMe = async (req, res) => {
  try {
    return successResponse(res, { ...publicUser(req.user), sessionExpiresAt: req.authSession?.expiresAt || null });
  } catch (error) {
    return errorResponse(res, error.message, 'ME_ERROR', 500);
  }
};
