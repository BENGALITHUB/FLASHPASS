import { calculatePassValidity, getISTDateString } from './date.utils.js';

export const posError = (message, code, status = 400) => Object.assign(new Error(message), { code, status });

// Cash sales follow the event being sold: its name, price, fee and days, the same ones online
// checkout uses. Platform-wide rules (cash price mode, token expiry, sales cut-off) stay global.
export function cashSettings(settings, event = null) {
  if (!event) return settings;
  const plain = typeof settings?.toObject === 'function' ? settings.toObject() : { ...settings };
  return {
    ...plain,
    eventName: event.name || plain.eventName,
    basePricePaise: Number.isSafeInteger(event.basePricePaise) ? event.basePricePaise : plain.basePricePaise,
    platformFeePaise: Number.isSafeInteger(event.platformFeePaise) ? event.platformFeePaise : plain.platformFeePaise,
    eventDays: event.eventDays?.length ? event.eventDays : plain.eventDays
  };
}

export function getCashPricing(settings) {
  const base = settings.basePricePaise;
  const fee = settings.platformFeePaise;
  const absorbsFee = settings.cashPriceMode === 'ORGANIZER_ABSORBS_FEE';
  if (![base, fee].every(value => Number.isSafeInteger(value) && value >= 0) || (absorbsFee && fee > base)) {
    throw posError('Cash pricing needs to be corrected in admin settings.', 'INVALID_PRICING', 409);
  }
  return {
    amountPaise: absorbsFee ? base : base + fee,
    basePricePaise: base,
    platformFeePaise: fee,
    organizerSharePaise: absorbsFee ? base - fee : base,
    customerFeePaise: absorbsFee ? 0 : fee,
    cashPriceMode: settings.cashPriceMode
  };
}

export function getCashAvailability(settings, event = null) {
  const validity = calculatePassValidity(event?.eventDays?.length ? event.eventDays : settings.eventDays, settings.salesCutoffDay3);
  const paused = settings.emergencyLockdown || event?.emergencyLockdown || settings.cashSalesEnabled === false || event?.cashSalesEnabled === false;
  return {
    salesOpen: !paused && validity.salesOpen,
    salesReason: paused ? 'Cash sales are paused by the organizer.' : validity.reason || null,
    badge: validity.badge,
    validDays: validity.validDays
  };
}

export function validateCash(cashTenderedPaise, amountPaise, expectedAmountPaise) {
  if (expectedAmountPaise !== undefined && expectedAmountPaise !== amountPaise) {
    throw posError('The ticket price has changed. Refresh the price and review the cash received.', 'PRICE_CHANGED', 409);
  }
  if (!Number.isSafeInteger(cashTenderedPaise) || cashTenderedPaise < 0) {
    throw posError('Enter a valid cash amount with no more than two decimal places.', 'INVALID_CASH');
  }
  if (cashTenderedPaise < amountPaise) {
    throw posError('Cash received is less than the amount due.', 'INSUFFICIENT_CASH');
  }
}

export function getTodayRange() {
  const date = getISTDateString();
  const start = new Date(`${date}T00:00:00+05:30`);
  return { date, start, end: new Date(start.getTime() + 86400000) };
}

// Ticket categories sold at the counter. General keeps the admin cash price (the price cash tokens quote);
// every other active tier is priced from its own tier price and fee, under the same cash price mode.
export function getCashTiers(settings, event = null) {
  const general = { tierId: 'general', name: 'General admission', badge: null, capacity: 0, soldCount: 0 };
  const tiers = (event?.ticketTiers || []).filter(tier => tier.active !== false);
  if (!tiers.some(tier => tier.tierId === 'general')) tiers.unshift(general);
  return tiers.flatMap(tier => {
    let pricing;
    try {
      pricing = tier.tierId === 'general' ? getCashPricing(settings) : getCashPricing({
        ...settings, basePricePaise: tier.pricePaise, platformFeePaise: tier.platformFeePaise ?? settings.platformFeePaise
      });
    } catch { return []; } // A mispriced tier is left off the counter rather than blocking every sale.
    const remaining = tier.capacity > 0 ? Math.max(0, tier.capacity - (tier.soldCount || 0)) : null;
    return [{ tierId: tier.tierId, name: tier.name, badge: tier.badge || null, color: tier.color || null, remaining, ...pricing }];
  });
}

// Extras (merch, food, parking…) the counter can add to a walk-in sale.
export function getCashAddOns(event = null) {
  return (event?.addOns || []).filter(item => item.active !== false && Number.isSafeInteger(item.pricePaise) && item.pricePaise >= 0).map(item => ({
    addOnId: item.addOnId, name: item.name, pricePaise: item.pricePaise, category: item.category || 'MERCH',
    variants: item.variants || [], remaining: Math.max(0, (item.inventory ?? Infinity) - (item.soldCount || 0))
  }));
}

// Turns the cashier's [{ addOnId, variant, quantity }] into order lines, checking price, variant and stock.
export function priceCashAddOns(event, items = []) {
  if (!Array.isArray(items) || items.length > 20) throw posError('Too many extras on one sale.', 'INVALID_ADDONS');
  const catalog = getCashAddOns(event);
  const lines = [];
  const wanted = {};
  for (const item of items) {
    const addOn = catalog.find(a => a.addOnId === item?.addOnId);
    if (!addOn) throw posError('An extra in this sale is no longer on sale. Refresh and try again.', 'INVALID_ADDONS', 409);
    const { quantity } = item;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw posError(`Choose a valid quantity for ${addOn.name}.`, 'INVALID_ADDONS');
    const variant = addOn.variants.length ? item.variant : undefined;
    if (addOn.variants.length && !addOn.variants.includes(variant)) throw posError(`Choose a size or option for ${addOn.name}.`, 'INVALID_ADDONS');
    wanted[addOn.addOnId] = (wanted[addOn.addOnId] || 0) + quantity;
    if (wanted[addOn.addOnId] > addOn.remaining) {
      throw posError(addOn.remaining ? `Only ${addOn.remaining} ${addOn.name} left.` : `${addOn.name} is sold out.`, 'ADDON_SOLD_OUT', 409);
    }
    lines.push({ addOnId: addOn.addOnId, name: addOn.name, pricePaise: addOn.pricePaise, quantity, variant, category: addOn.category, claimed: false });
  }
  return { addOns: lines, totalPaise: lines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0) };
}
