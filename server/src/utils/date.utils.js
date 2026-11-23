import { PASS_BADGES } from '../constants/index.js';

/**
 * Get current date/time components in Asia/Kolkata (IST)
 */
export const getISTNow = () => {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istString);
};

/**
 * Get current ISO date string (YYYY-MM-DD) in IST
 */
export const getISTDateString = () => {
  const ist = getISTNow();
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Determine current event day number (1, 2, 3 or null if outside event)
 */
export const getCurrentEventDay = (eventDays = []) => {
  const todayStr = getISTDateString();
  const found = eventDays.find(d => d.date === todayStr);
  if (found) return found.day;

  // If before Day 1, consider as Day 1 preparation
  if (eventDays.length > 0 && todayStr < eventDays[0].date) {
    return 1;
  }
  return null;
};

/**
 * Calculate dynamic valid days and badge for a newly confirmed pass
 * Based on BR-V-01, BR-V-02
 */
export const calculatePassValidity = (eventDays = [], salesCutoffDay3 = '18:00') => {
  const todayStr = getISTDateString();
  const istNow = getISTNow();
  const currentHoursMins = `${String(istNow.getHours()).padStart(2, '0')}:${String(istNow.getMinutes()).padStart(2, '0')}`;

  // Default: if before Day 1 or on Day 1
  if (!eventDays || eventDays.length === 0 || todayStr <= eventDays[0].date) {
    return {
      validDays: [1, 2, 3],
      badge: PASS_BADGES.ALL_ACCESS_3D,
      salesOpen: true
    };
  }

  // Day 2
  if (eventDays[1] && todayStr === eventDays[1].date) {
    return {
      validDays: [2, 3],
      badge: PASS_BADGES.PASS_2D,
      salesOpen: true
    };
  }

  // Day 3
  if (eventDays[2] && todayStr === eventDays[2].date) {
    if (currentHoursMins > salesCutoffDay3) {
      return {
        validDays: [],
        badge: PASS_BADGES.FINAL_1D,
        salesOpen: false,
        reason: 'Day 3 sales cut-off reached'
      };
    }
    return {
      validDays: [3],
      badge: PASS_BADGES.FINAL_1D,
      salesOpen: true
    };
  }

  // After Day 3
  if (eventDays[2] && todayStr > eventDays[2].date) {
    return {
      validDays: [],
      badge: null,
      salesOpen: false,
      reason: 'Event has ended'
    };
  }

  // Fallback for pre-event testing
  return {
    validDays: [1, 2, 3],
    badge: PASS_BADGES.ALL_ACCESS_3D,
    salesOpen: true
  };
};

/**
 * Generate human-readable Order ID: CC-XXXXXXXX (8 chars, unambiguous alphabet)
 * No 0, O, 1, I, L
 */
export const generateOrderId = () => {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CC-${result}`;
};

