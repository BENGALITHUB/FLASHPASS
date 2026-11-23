import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';

export const staffLogin = async (req, res) => {
  try {
    const { username, pin } = req.body;

    if (!username || !pin) {
      return errorResponse(res, 'Please enter username and 6-digit PIN', 'MISSING_CREDENTIALS', 400);
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
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

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
        name: user.name,
        assignedEventId: user.assignedEventId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return successResponse(res, {
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        assignedEventId: user.assignedEventId || null
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'LOGIN_ERROR', 500);
  }
};

export const getMe = async (req, res) => {
  try {
    return successResponse(res, {
      id: req.user._id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
      assignedEventId: req.user.assignedEventId || null
    });
  } catch (error) {
    return errorResponse(res, error.message, 'ME_ERROR', 500);
  }
};

