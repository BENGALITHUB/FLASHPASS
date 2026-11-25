// Exhibition stall sizes and their fixed prices (₹).
// Keep in sync with STALL_OPTIONS in server/src/constants/index.js — the server
// sets the stored price from its own copy.
export const STALL_OPTIONS = [
  { id: 'STANDARD_BOOTH', label: 'Standard Booth (10×5 sq ft)', priceRupees: 10000, emoji: '🎪' },
  { id: 'HALF_BOOTH', label: 'Half Booth (5×5 sq ft)', priceRupees: 5000, emoji: '🧺' },
  { id: 'PREMIUM_2X2', label: 'Premium Stall (2×2 sq m)', priceRupees: 7000, emoji: '✨' },
  { id: 'PREMIUM_3_5X2', label: 'Premium Stall (3.5×2 sq m)', priceRupees: 13250, emoji: '✨' },
  { id: 'PREMIUM_4_5X2', label: 'Premium Stall (4.5×2 sq m)', priceRupees: 18800, emoji: '💎' },
  { id: 'PREMIUM_7X2', label: 'Premium Stall (7×2 sq m)', priceRupees: 25300, emoji: '👑' },
  { id: 'FOOD_STALL', label: 'Food Stall (10×8 sq ft)', priceRupees: 30000, emoji: '🍔' }
];

// Older inquiries were sent with these booth types before the price list existed
const LEGACY_LABELS = {
  ARTIST_ALLEY: 'Artist Alley Table (6×3 ft)',
  PREMIUM_CORNER: 'Premium Corner Space (Double Front)'
};

export const findStall = (id) => STALL_OPTIONS.find((s) => s.id === id) || null;
export const stallLabel = (id) => findStall(id)?.label || LEGACY_LABELS[id] || id || '—';
export const formatRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
