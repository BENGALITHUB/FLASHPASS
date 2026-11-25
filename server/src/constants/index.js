export const ROLES = {
  ADMIN: 'SUPER_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  EVENT_ADMIN: 'EVENT_ADMIN',
  CASHIER: 'CASHIER',
  GATE: 'GATE_VOLUNTEER'
};

export const GATE_MODES = {
  ENTRY: 'ENTRY',
  EXIT: 'EXIT'
};

export const PRESENCE = {
  OUTSIDE: 'OUTSIDE',
  INSIDE: 'INSIDE'
};

export const PASS_BADGES = {
  ALL_ACCESS_3D: '3-DAY ALL ACCESS',
  PASS_2D: '2-DAY PASS',
  FINAL_1D: '1-DAY FINAL PASS'
};

export const PASS_STATUS = {
  ACTIVE: 'ACTIVE',
  VOIDED: 'VOIDED'
};

export const ORDER_STATUS = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  VOIDED: 'VOIDED'
};

export const ORDER_CHANNELS = {
  ONLINE: 'ONLINE',
  CASH_TOKEN: 'CASH_TOKEN',
  POS_WALKIN: 'POS_WALKIN'
};

export const CASH_TOKEN_STATUS = {
  OPEN: 'OPEN',
  PAID: 'PAID',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

export const SCAN_RESULTS = {
  ENTRY_OK: 'ENTRY_OK',
  EXIT_OK: 'EXIT_OK',
  ALREADY_INSIDE: 'ALREADY_INSIDE',
  ALREADY_USED_TODAY: 'ALREADY_USED_TODAY', // stamp mode: this pass already got in today
  NOT_VALID_TODAY: 'NOT_VALID_TODAY',
  INVALID_QR: 'INVALID_QR',
  VOIDED: 'VOIDED',
  EXIT_NOT_INSIDE: 'EXIT_NOT_INSIDE',
  OUTSIDE_GATE_HOURS: 'OUTSIDE_GATE_HOURS',
  REENTRY_DISABLED: 'REENTRY_DISABLED',
  MAX_REENTRIES_EXCEEDED: 'MAX_REENTRIES_EXCEEDED',
  EMERGENCY_LOCKDOWN: 'EMERGENCY_LOCKDOWN',
  AUTO_RESET: 'AUTO_RESET',
  FORCE_RESET: 'FORCE_RESET'
};

// How re-entry is controlled at the gate.
// IN_OUT: scan in and scan out; a pass that is inside cannot enter again.
// WRISTBAND: hand stamp / wristband. Each pass is scanned once per day on entry;
//   people coming back show the stamp and are not scanned again.
export const REENTRY_MODES = {
  IN_OUT: 'IN_OUT',
  WRISTBAND: 'WRISTBAND'
};

export const LEDGER_TYPES = {
  SALE: 'SALE',
  REVERSAL: 'REVERSAL'
};

export const DEFAULT_ADMIN_SETTINGS = {
  eventName: '3-Day Comics Carnival',
  venue: 'Milan Mela Prangan, Kolkata',
  announcementText: 'Tickets selling fast! Online passes valid for all 3 days.',
  basePricePaise: 5000,       // ₹50.00
  platformFeePaise: 200,      // ₹2.00
  partnerCommissionPct: 10,   // platform cut on sponsor/stall deals sourced through the website
  onePassPerPhone: true,
  maxPassesPerPhone: 5,
  capacityLimit: 3000,
  cashPriceMode: 'INCLUSIVE_TOTAL', // or 'ORGANIZER_ABSORBS_FEE'
  allowReentry: true,
  maxReentriesPerDay: 2,      // 0 = unlimited, or 1, 2, 3
  emergencyLockdown: false,
  cashSalesEnabled: true,
  onlineSalesEnabled: true,
  reentryMode: 'WRISTBAND',         // hand stamp (scan once a day); or 'IN_OUT' to scan in and out
  tokenExpiryMinutes: 30,
  gateOpenTime: '00:00',
  gateCloseTime: '23:59',
  salesCutoffDay3: '18:00',
  eventDays: [
    { day: 1, date: '2026-12-12', label: 'Day 1 (Saturday)' },
    { day: 2, date: '2026-12-13', label: 'Day 2 (Sunday)' },
    { day: 3, date: '2026-12-14', label: 'Day 3 (Monday)' }
  ]
};


// Exhibition stall sizes and their fixed prices (₹). The server sets an inquiry's
// price from this list, so a price sent by the browser is never trusted.
// Keep in sync with client/src/utils/stalls.js.
export const STALL_OPTIONS = [
  { id: 'STANDARD_BOOTH', label: 'Standard Booth (10×5 sq ft)', priceRupees: 10000 },
  { id: 'HALF_BOOTH', label: 'Half Booth (5×5 sq ft)', priceRupees: 5000 },
  { id: 'PREMIUM_2X2', label: 'Premium Stall (2×2 sq m)', priceRupees: 7000 },
  { id: 'PREMIUM_3_5X2', label: 'Premium Stall (3.5×2 sq m)', priceRupees: 13250 },
  { id: 'PREMIUM_4_5X2', label: 'Premium Stall (4.5×2 sq m)', priceRupees: 18800 },
  { id: 'PREMIUM_7X2', label: 'Premium Stall (7×2 sq m)', priceRupees: 25300 },
  { id: 'FOOD_STALL', label: 'Food Stall (10×8 sq ft)', priceRupees: 30000 }
];
