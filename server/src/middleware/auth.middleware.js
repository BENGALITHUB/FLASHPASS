import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { errorResponse } from '../utils/response.utils.js';

export const authenticateStaff = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return errorResponse(res, 'Authentication token required', 'UNAUTHORIZED', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user || !user.active) {
      return errorResponse(res, 'Invalid or deactivated user', 'UNAUTHORIZED', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    return errorResponse(res, 'Invalid or expired token', 'UNAUTHORIZED', 401);
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

