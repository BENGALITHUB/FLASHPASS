// Remaining-inventory helper shared by ticket tiers and merch add-ons.
// `low` only fires once stock is genuinely running out, so scarcity badges never show at launch.
export function stockInfo(capacity, sold) {
  const cap = Number(capacity) || 0;
  if (cap <= 0) return { soldOut: false, low: false };
  const left = Math.max(0, cap - (Number(sold) || 0));
  return {
    left,
    soldOut: left === 0,
    low: left > 0 && left <= Math.max(10, Math.round(cap * 0.15)),
    pctSold: Math.round(((cap - left) / cap) * 100)
  };
}
