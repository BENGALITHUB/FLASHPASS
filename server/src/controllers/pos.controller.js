import mongoose from 'mongoose';
import { CashToken } from '../models/CashToken.js';
import { Order } from '../models/Order.js';
import { Pass } from '../models/Pass.js';
import { Event } from '../models/Event.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Shift } from '../models/Shift.js';
import { AuditLog } from '../models/AuditLog.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { completeOrderAndIssuePass } from '../services/ledger.service.js';
import { emitTokenPaid } from '../services/socket.service.js';
import { generateOrderId, getCurrentEventDay } from '../utils/date.utils.js';
import { generateQRToken } from '../services/qr.service.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { getCashPricing, getCashAvailability, getCashTiers, getCashAddOns, priceCashAddOns, cashSettings, getTodayRange, validateCash, posError } from '../utils/pos.utils.js';
import { CASH_TOKEN_STATUS, ORDER_CHANNELS, ORDER_STATUS, LEDGER_TYPES, PASS_STATUS } from '../constants/index.js';

const cashChannels = [ORDER_CHANNELS.CASH_TOKEN, ORDER_CHANNELS.POS_WALKIN];
const fail = (res, error, code) => errorResponse(res, error.message, error.status ? error.code : code, error.status || 500);
const maskedPhone = phone => (phone || '').replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2');
// A walk-in for several guests is one order whose passes are <orderId>, <orderId>-P2, <orderId>-P3…
const orderPasses = orderId => ({ $or: [{ orderId }, { orderId: new RegExp(`^${orderId}-P\\d+$`) }] });
const maxWalkinTickets = settings => Math.min(10, Math.max(1, Number(settings.maxPassesPerPhone) || 5));
const checkQuantity = (quantity, settings) => {
  const maxTickets = maxWalkinTickets(settings);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxTickets) {
    throw posError(`Choose between 1 and ${maxTickets} tickets for one sale.`, 'INVALID_QUANTITY');
  }
};
const checkGuestNames = guestNames => {
  if (!Array.isArray(guestNames) || guestNames.length > 20 || guestNames.some(n => n != null && (typeof n !== 'string' || n.trim().length > 60))) {
    throw posError('Each guest name must be 60 characters or fewer.', 'INVALID_NAME');
  }
};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Each guest in a group gets their own pass and QR under their own details.
const resolveGroupAttendees = (quantity, attendees, guestNames, buyerName, phone, email, tierId) => {
  if (quantity <= 1) return [];
  if (Array.isArray(attendees) && attendees.length === quantity) {
    return attendees.map((a, i) => {
      const gName = typeof a?.name === 'string' && a.name.trim() ? a.name.trim() : `${buyerName} (${i + 1}/${quantity})`;
      const gPhone = String(a?.phone ?? '').replace(/\D/g, '').slice(-10);
      const gEmail = typeof a?.email === 'string' ? a.email.trim().toLowerCase() : '';
      if (gName.length > 60) throw posError('Each guest name must be 60 characters or fewer.', 'INVALID_NAME');
      if (gPhone && !/^[6-9]\d{9}$/.test(gPhone)) throw posError(`Enter a valid 10-digit mobile number for guest #${i + 1}.`, 'INVALID_PHONE');
      if (gEmail && !EMAIL_REGEX.test(gEmail)) throw posError(`Enter a valid email address for guest #${i + 1}.`, 'INVALID_EMAIL');
      return { name: gName, phone: gPhone || phone, email: gEmail || email, tierId };
    });
  }
  return Array.from({ length: quantity }, (_, i) => ({
    name: guestNames[i]?.trim() || `${buyerName} (${i + 1}/${quantity})`,
    phone,
    email,
    tierId
  }));
};
const parseToken = value => {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw posError('Enter a valid token number, for example C-142.', 'INVALID_TOKEN');
  }
  return Number(value);
};

// The counter sells for the cashier's own event. An account with no event (the super admin)
// can sell only while exactly one event is on sale, so a sale never lands on a guessed event.
async function findSaleEvent(user) {
  if (user?.assignedEventId) {
    const event = await Event.findOne({ eventId: user.assignedEventId });
    if (!event || event.status === 'ARCHIVED') throw posError('Your event is not on sale any more. Ask the organizer to move your account to the current event.', 'NO_EVENT', 409);
    return event;
  }
  const events = await Event.find({ status: 'ACTIVE' }).limit(2);
  if (events.length !== 1) throw posError(events.length ? 'More than one event is on sale. Log in with the cashier account of the event you are selling for.' : 'No event is on sale.', 'NO_EVENT', 409);
  return events[0];
}

async function cashContext(user) {
  const event = await findSaleEvent(user);
  const settings = cashSettings(await AdminSettings.getSettings(), event);
  return { settings, event, pricing: getCashPricing(settings), availability: getCashAvailability(settings, event), tiers: getCashTiers(settings, event) };
}

function requireSales(availability) {
  if (!availability.salesOpen) throw posError(availability.salesReason || 'Cash sales are closed.', 'SALES_CLOSED', 409);
}

function saleResponse(order, pass, cashTenderedPaise, token = null, passes = [pass]) {
  return {
    quantity: passes.length,
    tierId: order.tierId,
    tierName: order.tierName,
    addOns: (order.addOns || []).map(({ addOnId, name, variant, quantity, pricePaise }) => ({ addOnId, name, variant, quantity, pricePaise })),
    // Each pass's QR too, so the counter can make the PDFs to send the buyer.
    passes: passes.map(p => ({
      orderId: p.orderId, holderName: p.holderName, maskedPhone: maskedPhone(p.phone),
      badge: p.badge, validDays: p.validDays, qrToken: generateQRToken(p._id.toString(), p.qrNonce)
    })),
    orderId: order.orderId,
    amountPaise: order.amountPaise,
    paidAt: order.paidAt,
    undoUntil: new Date(new Date(order.paidAt).getTime() + 30000),
    changeRupees: ((cashTenderedPaise - order.amountPaise) / 100).toFixed(2),
    token,
    pass: {
      passId: pass._id, orderId: pass.orderId, holderName: pass.holderName,
      phone: pass.phone, maskedPhone: maskedPhone(pass.phone), badge: pass.badge,
      validDays: pass.validDays, status: pass.status, presence: pass.presence,
      qrToken: generateQRToken(pass._id.toString(), pass.qrNonce)
    }
  };
}

export const getPOSConfig = async (req, res) => {
  try {
    const { settings, event, pricing, availability, tiers } = await cashContext(req.user);
    // The event's name, venue and days also go on the ticket pictures the counter sends.
    return successResponse(res, { eventId: event.eventId, eventName: settings.eventName, venue: event.venue || '', eventDays: settings.eventDays || [], maxWalkinTickets: maxWalkinTickets(settings), tiers, addOns: getCashAddOns(event), ...pricing, ...availability });
  } catch (error) { return fail(res, error, 'POS_CONFIG_ERROR'); }
};

export const lookupToken = async (req, res) => {
  try {
    const tokenNo = parseToken(req.params.tokenNo);
    const { settings, event, pricing, availability } = await cashContext(req.user);
    requireSales(availability);
    const token = await CashToken.findOne({ tokenNo, eventId: event.eventId, eventDay: getCurrentEventDay(settings.eventDays) || 1, status: CASH_TOKEN_STATUS.OPEN });
    if (!token) throw posError('No open token found. Check the number with the guest.', 'TOKEN_NOT_FOUND', 404);
    if (new Date(token.expiresAt).getTime() <= Date.now()) throw posError('This token has expired. Ask the guest to create a new token.', 'TOKEN_EXPIRED');
    return successResponse(res, { token, ...pricing, ...availability, amountRupees: (pricing.amountPaise / 100).toFixed(2), maskedPhone: maskedPhone(token.phone) });
  } catch (error) { return fail(res, error, 'LOOKUP_ERROR'); }
};

export const confirmTokenPayment = async (req, res) => {
  try {
    const tokenNo = parseToken(req.params.tokenNo);
    const { cashTenderedPaise, expectedAmountPaise, quantity = 1, guestNames = [], attendees = null } = req.body;
    const { settings, event, pricing, availability, tiers } = await cashContext(req.user);
    requireSales(availability);
    // The token holder may pay for friends too: one order, one pass per guest.
    checkQuantity(quantity, settings);
    checkGuestNames(guestNames);
    const remaining = tiers.find(tier => tier.tierId === 'general')?.remaining ?? null;
    if (remaining !== null && quantity > remaining) throw posError(remaining ? `Only ${remaining} tickets left.` : 'Tickets are sold out.', 'SOLD_OUT', 409);
    validateCash(cashTenderedPaise, pricing.amountPaise * quantity, expectedAmountPaise);
    const orderId = generateOrderId();
    const result = await mongoose.connection.transaction(async session => {
      // Claim and settle together, so simultaneous confirmations cannot issue two passes.
      const token = await CashToken.findOneAndUpdate({
        tokenNo, eventId: event.eventId, eventDay: getCurrentEventDay(settings.eventDays) || 1,
        status: CASH_TOKEN_STATUS.OPEN, expiresAt: { $gt: new Date() }
      }, { $set: { status: CASH_TOKEN_STATUS.PAID, orderId } }, { new: true, session });
      if (!token) throw posError('Token expired or already collected. Look it up again before taking cash.', 'TOKEN_UNAVAILABLE', 409);
      const tokenAttendees = resolveGroupAttendees(quantity, attendees, guestNames, token.holderName, token.phone, token.email || '');
      await Order.create([{
        orderId, eventId: event.eventId, cashTenderedPaise, channel: ORDER_CHANNELS.CASH_TOKEN, holderName: token.holderName, phone: token.phone, email: token.email || '',
        amountPaise: pricing.amountPaise * quantity, organizerSharePaise: pricing.organizerSharePaise * quantity,
        platformFeePaise: pricing.platformFeePaise * quantity, status: ORDER_STATUS.CREATED, cashierId: req.user._id,
        isGroupBooking: quantity > 1,
        attendees: tokenAttendees,
        gateway: { provider: 'CASH', method: 'CASH' }
      }], { session });
      const { order, pass, passes } = await completeOrderAndIssuePass({ orderId, cashierId: req.user._id, session });
      return saleResponse(order, pass, cashTenderedPaise, token, passes);
    });
    emitTokenPaid(result.token._id.toString(), result.pass);
    return successResponse(res, result);
  } catch (error) { return fail(res, error, 'CONFIRM_FAILED'); }
};

export const walkinSale = async (req, res) => {
  try {
    const { name, phone, email, quantity = 1, guestNames = [], attendees = null, tierId = 'general', addOns: extras = [], cashTenderedPaise, expectedAmountPaise, requestId } = req.body;
    const guestName = typeof name === 'string' && name.trim() ? name.trim() : 'Walk-in Guest';
    const guestPhone = typeof phone === 'string' ? phone.trim() : '';
    const guestEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (guestName.length > 60) throw posError('Guest name must be 60 characters or fewer.', 'INVALID_NAME');
    checkGuestNames(guestNames);
    if (guestPhone && !/^[6-9]\d{9}$/.test(guestPhone)) throw posError('Enter a valid 10-digit mobile number, or leave it blank.', 'INVALID_PHONE');
    if (!EMAIL_REGEX.test(guestEmail)) throw posError('Enter a valid email address for the guest.', 'INVALID_EMAIL');
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId))) throw posError('Invalid sale reference. Start a new sale.', 'INVALID_REQUEST');
    const posRequestId = requestId ? `${req.user._id}:${requestId}` : undefined;
    // A retry after a lost response returns the existing receipt, never another ticket.
    if (posRequestId) {
      const existing = await Order.findOne({ posRequestId });
      if (existing) {
        if (existing.status !== ORDER_STATUS.PAID) throw posError('This sale has already been reversed. Start a new sale.', 'SALE_REVERSED', 409);
        const passes = await Pass.find(orderPasses(existing.orderId)).sort({ groupIndex: 1 });
        return successResponse(res, saleResponse(existing, passes[0], existing.cashTenderedPaise, null, passes));
      }
    }
    const { settings, event, availability, tiers } = await cashContext(req.user);
    requireSales(availability);
    const pricing = tiers.find(tier => tier.tierId === tierId);
    if (!pricing) throw posError('This ticket category is not on sale at the counter. Refresh and choose another.', 'INVALID_TIER', 409);
    checkQuantity(quantity, settings);
    if (pricing.remaining !== null && quantity > pricing.remaining) {
      throw posError(pricing.remaining ? `Only ${pricing.remaining} ${pricing.name} left.` : `${pricing.name} is sold out.`, 'SOLD_OUT', 409);
    }
    const addOns = priceCashAddOns(event, extras);
    validateCash(cashTenderedPaise, pricing.amountPaise * quantity + addOns.totalPaise, expectedAmountPaise);
    const orderId = generateOrderId();
    const holderPhone = guestPhone || '0000000000';
    const result = await mongoose.connection.transaction(async session => {
      await Order.create([{
        orderId, eventId: event.eventId, posRequestId, cashTenderedPaise, channel: ORDER_CHANNELS.POS_WALKIN,
        holderName: guestName, phone: holderPhone, email: guestEmail, tierId: pricing.tierId, tierName: pricing.name,
        // Extras go wholly to the organizer; the platform fee applies to tickets only, as online.
        subtotalPaise: pricing.basePricePaise * quantity, addOns: addOns.addOns,
        amountPaise: pricing.amountPaise * quantity + addOns.totalPaise,
        organizerSharePaise: pricing.organizerSharePaise * quantity + addOns.totalPaise, platformFeePaise: pricing.platformFeePaise * quantity,
        isGroupBooking: quantity > 1,
        attendees: resolveGroupAttendees(quantity, attendees, guestNames, guestName, holderPhone, guestEmail, pricing.tierId),
        status: ORDER_STATUS.CREATED, cashierId: req.user._id, gateway: { provider: 'CASH', method: 'CASH' }
      }], { session });
      const { order, pass, passes } = await completeOrderAndIssuePass({ orderId, cashierId: req.user._id, session });
      return saleResponse(order, pass, cashTenderedPaise, null, passes);
    });
    return successResponse(res, result, 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'This sale is already being processed. Refresh recent tickets before retrying.', 'SALE_IN_PROGRESS', 409);
    return fail(res, error, 'WALKIN_FAILED');
  }
};

export const undoLastConfirmation = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (typeof orderId !== 'string' || !orderId) throw posError('Select a recent sale to undo.', 'INVALID_ORDER');
    const result = await mongoose.connection.transaction(async session => {
      const order = await Order.findOne({ orderId, cashierId: req.user._id, channel: { $in: cashChannels }, status: ORDER_STATUS.PAID }).session(session);
      if (!order) throw posError('Paid cash order not found or already reversed.', 'NOT_FOUND', 404);
      if (!order.paidAt || Date.now() - new Date(order.paidAt).getTime() >= 30000) throw posError('The 30-second undo window has ended. Contact an admin.', 'UNDO_EXPIRED');
      if (order.addOns?.some(item => item.claimed)) throw posError('An extra from this sale has already been handed over. Contact an admin.', 'ADDON_CLAIMED', 409);
      // A group sale is reversed as a whole, so every pass in it must still be unused.
      const passes = await Pass.find(orderPasses(orderId)).session(session);
      const used = pass => pass.status !== PASS_STATUS.ACTIVE || pass.presence === 'INSIDE' || pass.lastScan?.at || pass.firstEntryDays?.length;
      if (!passes.length || passes.some(used)) {
        throw posError(passes.length > 1 ? 'A ticket in this group has already been used. Contact an admin.' : 'This pass has already been used or cancelled. Contact an admin.', 'PASS_USED', 409);
      }
      for (const pass of passes) {
        pass.status = PASS_STATUS.VOIDED;
        await pass.save({ session });
      }
      order.status = ORDER_STATUS.VOIDED;
      await order.save({ session });
      await CashToken.updateOne({ orderId, status: CASH_TOKEN_STATUS.PAID }, { $set: { status: CASH_TOKEN_STATUS.CANCELLED } }, { session });
      await LedgerEntry.create([{
        orderId, eventId: order.eventId, type: LEDGER_TYPES.REVERSAL, channel: order.channel,
        grossPaise: -order.amountPaise, organizerPaise: -order.organizerSharePaise,
        platformPaise: -order.platformFeePaise, byUserId: req.user._id, at: new Date()
      }], { session });
      await Event.updateOne({ eventId: order.eventId, ticketTiers: { $elemMatch: { tierId: order.tierId, soldCount: { $gt: 0 } } } }, { $inc: { 'ticketTiers.$.soldCount': -passes.length } }, { session });
      for (const item of order.addOns || []) {
        await Event.updateOne({ eventId: order.eventId, addOns: { $elemMatch: { addOnId: item.addOnId, soldCount: { $gte: item.quantity || 1 } } } }, { $inc: { 'addOns.$.soldCount': -(item.quantity || 1) } }, { session });
      }
      return { message: 'Sale reversed. Return the ticket amount to the guest.', refundPaise: order.amountPaise, quantity: passes.length };
    });
    return successResponse(res, result);
  } catch (error) { return fail(res, error, 'UNDO_FAILED'); }
};

// ---- Shifts (SRS FR-M5-07, BR-F-03) ----

// The cashier's open shift, started automatically if there isn't one
async function openShiftFor(user) {
  try {
    return await Shift.findOneAndUpdate(
      { cashierId: user._id, status: 'OPEN' },
      { $setOnInsert: { cashierId: user._id, cashierName: user.name || user.username, openedAt: new Date(), openingFloatPaise: 0 } },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code === 11000) return Shift.findOne({ cashierId: user._id, status: 'OPEN' }); // opened by a parallel request
    throw err;
  }
}

// Cash sales by this cashier during the shift (undone sales are VOIDED, so not counted)
async function shiftTotals(shift) {
  const paidAt = { $gte: shift.openedAt, ...(shift.closedAt ? { $lte: shift.closedAt } : {}) };
  const match = { cashierId: shift.cashierId, channel: { $in: cashChannels }, status: ORDER_STATUS.PAID, paidAt };
  const [totals, recentSales] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: null, salesPaise: { $sum: '$amountPaise' }, ticketCount: { $sum: { $max: [1, { $size: { $ifNull: ['$attendees', []] } }] } } } }]),
    Order.find(match).sort({ paidAt: -1, _id: -1 }).limit(5).select('orderId holderName tierName amountPaise channel paidAt attendees')
  ]);
  const { salesPaise = 0, ticketCount = 0 } = totals[0] || {};
  return {
    salesPaise,
    ticketCount,
    expectedPaise: (shift.openingFloatPaise || 0) + salesPaise,
    recentSales: recentSales.map(({ orderId, holderName, tierName, amountPaise, channel, paidAt, attendees }) => ({ orderId, holderName, tierName, amountPaise, channel, paidAt, quantity: attendees?.length || 1 }))
  };
}

const shiftView = (shift, totals) => ({
  shiftId: shift._id,
  openedAt: shift.openedAt,
  openingFloatPaise: shift.openingFloatPaise || 0,
  salesPaise: totals.salesPaise,
  ticketCount: totals.ticketCount,
  expectedInDrawerPaise: totals.expectedPaise
});

export const getShiftSummary = async (req, res) => {
  try {
    const { date } = getTodayRange();
    const shift = await openShiftFor(req.user);
    const totals = await shiftTotals(shift);
    return successResponse(res, {
      date,
      period: 'CURRENT_SHIFT',
      shift: shiftView(shift, totals),
      // Figures for this shift (kept under the old names the counter screen reads)
      ticketCount: totals.ticketCount,
      totalCashPaise: totals.salesPaise,
      totalCashRupees: (totals.salesPaise / 100).toFixed(2),
      recentSales: totals.recentSales
    });
  } catch (error) { return fail(res, error, 'SHIFT_SUMMARY_ERROR'); }
};

// POST /pos/shift/float  { openingFloatPaise }: cash already in the drawer at the start
export const setShiftFloat = async (req, res) => {
  try {
    const value = Number(req.body.openingFloatPaise);
    if (!Number.isInteger(value) || value < 0 || value > 10_000_000) throw posError('Enter the cash in the drawer, in rupees.', 'INVALID_FLOAT');
    const shift = await openShiftFor(req.user);
    const before = shift.openingFloatPaise || 0;
    shift.openingFloatPaise = value;
    await shift.save();
    await AuditLog.create({
      actorId: req.user._id, actorName: req.user.name || 'Cashier', action: 'SET_SHIFT_FLOAT',
      target: `Shift ${shift._id}`, reason: 'Opening cash in drawer', before: { openingFloatPaise: before }, after: { openingFloatPaise: value }
    });
    const totals = await shiftTotals(shift);
    return successResponse(res, { shift: shiftView(shift, totals) });
  } catch (error) { return fail(res, error, 'SHIFT_FLOAT_ERROR'); }
};

// POST /pos/shift/close  { countedPaise, notes }: count the drawer and close the shift
export const closeShift = async (req, res) => {
  try {
    const counted = Number(req.body.countedPaise);
    const notes = String(req.body.notes || '').trim().slice(0, 500);
    if (!Number.isInteger(counted) || counted < 0) throw posError('Enter the cash you counted in the drawer.', 'INVALID_COUNT');

    const shift = await Shift.findOne({ cashierId: req.user._id, status: 'OPEN' });
    if (!shift) throw posError('There is no open shift to close.', 'NO_OPEN_SHIFT', 404);

    const closedAt = new Date();
    const totals = await shiftTotals({ ...shift.toObject(), closedAt });
    const difference = counted - totals.expectedPaise;
    if (difference !== 0 && notes.length < 5) {
      throw posError(`The drawer is ${difference > 0 ? 'over' : 'short'} by ${formatRupees(Math.abs(difference))}. Write a short note on why before closing.`, 'NOTE_REQUIRED');
    }

    const closed = await Shift.findOneAndUpdate(
      { _id: shift._id, status: 'OPEN' },
      { $set: {
        status: 'CLOSED', closedAt, salesPaise: totals.salesPaise, ticketCount: totals.ticketCount,
        expectedPaise: totals.expectedPaise, countedPaise: counted, differencePaise: difference, notes
      } },
      { new: true }
    );
    if (!closed) throw posError('This shift was already closed.', 'ALREADY_CLOSED', 409);

    await AuditLog.create({
      actorId: req.user._id, actorName: req.user.name || 'Cashier', action: 'CLOSE_SHIFT',
      target: `Shift ${shift._id}`, reason: notes || 'Shift closed, drawer matched',
      after: { salesPaise: totals.salesPaise, expectedPaise: totals.expectedPaise, countedPaise: counted, differencePaise: difference }
    });

    return successResponse(res, {
      message: difference === 0 ? 'Shift closed. The drawer matches.' : `Shift closed. Drawer ${difference > 0 ? 'over' : 'short'} by ${formatRupees(Math.abs(difference))}.`,
      shift: {
        shiftId: closed._id, openedAt: closed.openedAt, closedAt: closed.closedAt,
        openingFloatPaise: closed.openingFloatPaise, salesPaise: closed.salesPaise, ticketCount: closed.ticketCount,
        expectedPaise: closed.expectedPaise, countedPaise: closed.countedPaise, differencePaise: closed.differencePaise, notes: closed.notes
      }
    });
  } catch (error) { return fail(res, error, 'SHIFT_CLOSE_ERROR'); }
};

const formatRupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

