import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Event } from '../models/Event.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { Payout, PAYOUT_METHODS } from '../models/Payout.js';
import { SettlementRequest, REQUEST_STATUS } from '../models/SettlementRequest.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { ROLES, LEDGER_TYPES } from '../constants/index.js';

/*
 * Organizer settlement.
 *
 * What the organizer is owed comes only from the ledger (sales minus reversals),
 * so it always matches the money actually collected. Payouts are what the
 * platform has already sent. Balance = owed − paid out.
 *
 * The system records payouts; it does not move money.
 */

// Ledger entries saved before events had IDs belong to the first event.
const DEFAULT_EVENT = 'comics-carnival';
const METHODS_NEEDING_REFERENCE = ['BANK_TRANSFER', 'UPI', 'CHEQUE'];

const isPlatformAdmin = (user) => user?.role === ROLES.SUPER_ADMIN;
// An event admin with no event set sees no event's money, never the oldest event's.
const ownEventId = (user) => (user?.assignedEventId || '__no-event__').toLowerCase();
const canSeeEvent = (user, eventId) =>
  isPlatformAdmin(user) || (user?.role === ROLES.EVENT_ADMIN && ownEventId(user) === eventId);
const normEventId = (v) => String(v || '').trim().toLowerCase();
const actor = (user) => ({ id: user._id, name: user.name || user.username || 'Admin' });
const rupees = (paise) => ((paise || 0) / 100).toFixed(2);

/**
 * Money summary for the given events (or every event when eventIds is null).
 */
async function buildSummaries(eventIds, session = null) {
  const ledgerEventKey = { $ifNull: ['$eventId', DEFAULT_EVENT] };
  const ledgerMatch = eventIds ? { $expr: { $in: [ledgerEventKey, eventIds] } } : {};

  const ledgerAgg = await LedgerEntry.aggregate([
    { $match: ledgerMatch },
    {
      $group: {
        _id: ledgerEventKey,
        grossPaise: { $sum: '$grossPaise' },
        organizerPaise: { $sum: '$organizerPaise' },
        platformPaise: { $sum: '$platformPaise' },
        sales: { $sum: { $cond: [{ $eq: ['$type', LEDGER_TYPES.SALE] }, 1, 0] } },
        reversals: { $sum: { $cond: [{ $eq: ['$type', LEDGER_TYPES.REVERSAL] }, 1, 0] } }
      }
    }
  ]).session(session);

  const payoutMatch = { voided: false, ...(eventIds ? { eventId: { $in: eventIds } } : {}) };
  const payoutAgg = await Payout.aggregate([
    { $match: payoutMatch },
    { $group: { _id: '$eventId', paidPaise: { $sum: '$amountPaise' }, count: { $sum: 1 }, lastPaidAt: { $max: '$paidAt' } } }
  ]).session(session);

  const ids = new Set(eventIds || []);
  ledgerAgg.forEach(l => ids.add(l._id));
  payoutAgg.forEach(p => ids.add(p._id));
  if (!eventIds) {
    (await Event.find().select('eventId').lean().session(session)).forEach(e => ids.add(e.eventId));
  }
  const allIds = [...ids];

  const [events, organizers, pending] = await Promise.all([
    Event.find({ eventId: { $in: allIds } }).select('eventId name venue status').lean().session(session),
    User.find({ role: ROLES.EVENT_ADMIN, assignedEventId: { $in: allIds } }).select('name username assignedEventId').lean().session(session),
    SettlementRequest.find({ eventId: { $in: allIds }, status: REQUEST_STATUS.PENDING }).lean().session(session)
  ]);

  return allIds.map(eventId => {
    const ev = events.find(e => e.eventId === eventId);
    const l = ledgerAgg.find(x => x._id === eventId) || {};
    const p = payoutAgg.find(x => x._id === eventId) || {};
    const owedPaise = l.organizerPaise || 0;
    const paidOutPaise = p.paidPaise || 0;
    const org = organizers.find(o => o.assignedEventId === eventId);
    return {
      eventId,
      name: ev?.name || eventId,
      venue: ev?.venue || '',
      status: ev?.status || 'ACTIVE',
      organizer: org ? { name: org.name, username: org.username } : null,
      passesSold: (l.sales || 0) - (l.reversals || 0),
      grossPaise: l.grossPaise || 0,
      platformPaise: l.platformPaise || 0,
      owedPaise,
      paidOutPaise,
      balancePaise: owedPaise - paidOutPaise,
      payoutCount: p.count || 0,
      lastPaidAt: p.lastPaidAt || null,
      pendingRequest: pending.find(r => r.eventId === eventId) || null
    };
  }).sort((a, b) => b.balancePaise - a.balancePaise);
}

/**
 * GET /api/v1/admin/settlements
 * Platform admin: every event. Event admin: only their own event.
 */
export const listSettlements = async (req, res) => {
  try {
    const eventIds = isPlatformAdmin(req.user) ? null : [ownEventId(req.user)];
    const events = await buildSummaries(eventIds);
    const totals = events.reduce((t, e) => ({
      grossPaise: t.grossPaise + e.grossPaise,
      platformPaise: t.platformPaise + e.platformPaise,
      owedPaise: t.owedPaise + e.owedPaise,
      paidOutPaise: t.paidOutPaise + e.paidOutPaise,
      balancePaise: t.balancePaise + e.balancePaise,
      pendingRequests: t.pendingRequests + (e.pendingRequest ? 1 : 0)
    }), { grossPaise: 0, platformPaise: 0, owedPaise: 0, paidOutPaise: 0, balancePaise: 0, pendingRequests: 0 });

    return successResponse(res, { events, totals, methods: PAYOUT_METHODS });
  } catch (error) {
    return errorResponse(res, error.message, 'SETTLEMENT_LIST_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/settlements/:eventId
 * Summary plus full payout and request history for one event.
 */
export const getSettlement = async (req, res) => {
  try {
    const eventId = normEventId(req.params.eventId);
    if (!canSeeEvent(req.user, eventId)) {
      return errorResponse(res, 'You can only view your own event', 'FORBIDDEN', 403);
    }
    const [summary] = await buildSummaries([eventId]);
    const [payouts, requests] = await Promise.all([
      Payout.find({ eventId }).sort({ paidAt: -1, createdAt: -1 }).lean(),
      SettlementRequest.find({ eventId }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    return successResponse(res, { summary, payouts, requests, methods: PAYOUT_METHODS });
  } catch (error) {
    return errorResponse(res, error.message, 'SETTLEMENT_DETAIL_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/settlements/:eventId/payouts   (platform admin + PIN)
 * Record money already sent to the organizer.
 */
export const recordPayout = async (req, res) => {
  if (!isPlatformAdmin(req.user)) {
    return errorResponse(res, 'Only the platform admin can record payouts', 'FORBIDDEN', 403);
  }

  const eventId = normEventId(req.params.eventId);
  const amountPaise = Number(req.body.amountPaise);
  const method = String(req.body.method || '').toUpperCase();
  const reference = String(req.body.reference || '').trim();
  const note = String(req.body.note || '').trim().slice(0, 500);
  const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
  const requestId = req.body.requestId || null;

  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return errorResponse(res, 'Enter an amount greater than ₹0', 'INVALID_AMOUNT', 400);
  }
  if (!PAYOUT_METHODS.includes(method)) {
    return errorResponse(res, 'Choose how the money was sent', 'INVALID_METHOD', 400);
  }
  if (METHODS_NEEDING_REFERENCE.includes(method) && !reference) {
    return errorResponse(res, 'Enter the UTR / transaction / cheque number so this payment can be traced', 'REFERENCE_REQUIRED', 400);
  }
  if (reference.length > 100) {
    return errorResponse(res, 'Reference is too long', 'INVALID_REFERENCE', 400);
  }
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return errorResponse(res, 'Payment date is not valid', 'INVALID_DATE', 400);
  }

  const session = await mongoose.startSession();
  try {
    let created = null;
    await session.withTransaction(async () => {
      // Lock: concurrent payouts for this event conflict here and get retried in order
      const lock = await Event.updateOne({ eventId }, { $inc: { settlementSeq: 1 } }, { session });
      if (lock.matchedCount === 0) {
        throw Object.assign(new Error('Event not found'), { status: 404, code: 'NOT_FOUND' });
      }

      const [summary] = await buildSummaries([eventId], session);
      if (amountPaise > summary.balancePaise) {
        throw Object.assign(
          new Error(`That is more than the balance due (₹${rupees(summary.balancePaise)}). Check if this payment was already recorded.`),
          { status: 400, code: 'EXCEEDS_BALANCE' }
        );
      }

      let request = null;
      if (requestId) {
        request = await SettlementRequest.findOne({ _id: requestId, eventId, status: REQUEST_STATUS.PENDING }).session(session);
        if (!request) {
          throw Object.assign(new Error('That payout request is no longer open'), { status: 409, code: 'REQUEST_CLOSED' });
        }
      }

      [created] = await Payout.create([{
        eventId, amountPaise, paidAt, method, reference, note,
        recordedBy: actor(req.user),
        requestId: request?._id || null
      }], { session });

      if (request) {
        request.status = REQUEST_STATUS.PAID;
        request.resolvedAt = new Date();
        request.resolvedBy = actor(req.user);
        request.payoutId = created._id;
        await request.save({ session });
      }

      await AuditLog.create([{
        actorId: req.user._id,
        actorName: actor(req.user).name,
        action: 'RECORD_PAYOUT',
        target: `Event ${eventId}`,
        reason: note || `Payout via ${method}`,
        before: { balancePaise: summary.balancePaise },
        after: { payoutId: created._id, amountPaise, method, reference, balancePaise: summary.balancePaise - amountPaise }
      }], { session });
    });

    return successResponse(res, { message: `Payout of ₹${rupees(amountPaise)} recorded`, payout: created }, 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'This UTR / reference is already recorded for this event', 'DUPLICATE_REFERENCE', 409);
    }
    if (error.status) {
      return errorResponse(res, error.message, error.code, error.status);
    }
    return errorResponse(res, error.message, 'PAYOUT_ERROR', 500);
  } finally {
    await session.endSession();
  }
};

/**
 * POST /api/v1/admin/settlements/payouts/:payoutId/void   (platform admin + PIN)
 * Undo a wrongly recorded payout. The record stays, marked void, with the reason.
 */
export const voidPayout = async (req, res) => {
  if (!isPlatformAdmin(req.user)) {
    return errorResponse(res, 'Only the platform admin can void payouts', 'FORBIDDEN', 403);
  }
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) {
    return errorResponse(res, 'Write why this payout is being voided', 'REASON_REQUIRED', 400);
  }

  try {
    const payout = await Payout.findOneAndUpdate(
      { _id: req.params.payoutId, voided: false },
      { $set: { voided: true, voidedAt: new Date(), voidReason: reason.slice(0, 500), voidedBy: actor(req.user) } },
      { new: true }
    );
    if (!payout) {
      return errorResponse(res, 'Payout not found or already voided', 'NOT_FOUND', 404);
    }

    // A request that this payout settled is open again
    if (payout.requestId) {
      await SettlementRequest.updateOne(
        { _id: payout.requestId, status: REQUEST_STATUS.PAID },
        { $set: { status: REQUEST_STATUS.PENDING, payoutId: null, resolutionNote: `Payout voided: ${reason}` } }
      ).catch(() => {}); // another request may be open by now; leave this one closed
    }

    await AuditLog.create({
      actorId: req.user._id,
      actorName: actor(req.user).name,
      action: 'VOID_PAYOUT',
      target: `Event ${payout.eventId}`,
      reason,
      before: { payoutId: payout._id, amountPaise: payout.amountPaise, reference: payout.reference }
    });

    return successResponse(res, { message: 'Payout voided', payout });
  } catch (error) {
    return errorResponse(res, error.message, 'VOID_PAYOUT_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/settlements/:eventId/requests   (event organizer)
 * Ask the platform to pay out. Defaults to the full balance.
 */
export const createPayoutRequest = async (req, res) => {
  const eventId = normEventId(req.params.eventId);
  if (req.user.role !== ROLES.EVENT_ADMIN || ownEventId(req.user) !== eventId) {
    return errorResponse(res, 'Only this event\'s organizer can request a payout', 'FORBIDDEN', 403);
  }

  const payTo = String(req.body.payTo || '').trim();
  const note = String(req.body.note || '').trim().slice(0, 500);
  if (payTo.length < 5) {
    return errorResponse(res, 'Enter the UPI ID or bank account (name, account number, IFSC) to pay to', 'PAY_TO_REQUIRED', 400);
  }

  try {
    const [summary] = await buildSummaries([eventId]);
    if (summary.balancePaise <= 0) {
      return errorResponse(res, 'There is no balance due right now', 'NO_BALANCE', 400);
    }
    const amountPaise = req.body.amountPaise !== undefined && req.body.amountPaise !== null && req.body.amountPaise !== ''
      ? Number(req.body.amountPaise)
      : summary.balancePaise;
    if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > summary.balancePaise) {
      return errorResponse(res, `Amount must be between ₹0.01 and ₹${rupees(summary.balancePaise)}`, 'INVALID_AMOUNT', 400);
    }

    const request = await SettlementRequest.create({
      eventId, amountPaise, payTo: payTo.slice(0, 300), note, requestedBy: actor(req.user)
    });

    await AuditLog.create({
      actorId: req.user._id,
      actorName: actor(req.user).name,
      action: 'REQUEST_PAYOUT',
      target: `Event ${eventId}`,
      reason: note || 'Organizer requested payout',
      after: { requestId: request._id, amountPaise }
    });

    return successResponse(res, { message: 'Payout request sent', request }, 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'You already have a payout request waiting', 'REQUEST_ALREADY_OPEN', 409);
    }
    return errorResponse(res, error.message, 'PAYOUT_REQUEST_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/settlements/requests/:requestId/close
 * Organizer cancels their own request, or platform admin rejects it (reason required).
 */
export const closePayoutRequest = async (req, res) => {
  try {
    const request = await SettlementRequest.findOne({ _id: req.params.requestId, status: REQUEST_STATUS.PENDING });
    if (!request) {
      return errorResponse(res, 'Request not found or already closed', 'NOT_FOUND', 404);
    }

    const reason = String(req.body.reason || '').trim().slice(0, 500);
    let status;
    if (isPlatformAdmin(req.user)) {
      if (reason.length < 5) {
        return errorResponse(res, 'Write why the request is being rejected', 'REASON_REQUIRED', 400);
      }
      status = REQUEST_STATUS.REJECTED;
    } else if (req.user.role === ROLES.EVENT_ADMIN && ownEventId(req.user) === request.eventId) {
      status = REQUEST_STATUS.CANCELLED;
    } else {
      return errorResponse(res, 'Access forbidden', 'FORBIDDEN', 403);
    }

    const closed = await SettlementRequest.findOneAndUpdate(
      { _id: request._id, status: REQUEST_STATUS.PENDING },
      { $set: { status, resolvedAt: new Date(), resolvedBy: actor(req.user), resolutionNote: reason } },
      { new: true }
    );
    if (!closed) {
      return errorResponse(res, 'Request was just closed by someone else', 'REQUEST_CLOSED', 409);
    }

    await AuditLog.create({
      actorId: req.user._id,
      actorName: actor(req.user).name,
      action: status === REQUEST_STATUS.REJECTED ? 'REJECT_PAYOUT_REQUEST' : 'CANCEL_PAYOUT_REQUEST',
      target: `Event ${request.eventId}`,
      reason: reason || 'Cancelled by organizer'
    });

    return successResponse(res, { message: status === REQUEST_STATUS.REJECTED ? 'Request rejected' : 'Request cancelled', request: closed });
  } catch (error) {
    return errorResponse(res, error.message, 'CLOSE_REQUEST_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/settlements/:eventId/statement
 * CSV statement: summary, sales by day, and every payout (voided ones marked).
 */
export const downloadStatement = async (req, res) => {
  try {
    const eventId = normEventId(req.params.eventId);
    if (!canSeeEvent(req.user, eventId)) {
      return errorResponse(res, 'You can only download your own event\'s statement', 'FORBIDDEN', 403);
    }

    const [summary] = await buildSummaries([eventId]);
    const payouts = await Payout.find({ eventId }).sort({ paidAt: 1 }).lean();
    const salesByDay = await LedgerEntry.aggregate([
      { $match: { $expr: { $eq: [{ $ifNull: ['$eventId', DEFAULT_EVENT] }, eventId] } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: '+05:30' } },
          passes: { $sum: { $cond: [{ $eq: ['$type', LEDGER_TYPES.SALE] }, 1, -1] } },
          grossPaise: { $sum: '$grossPaise' },
          platformPaise: { $sum: '$platformPaise' },
          organizerPaise: { $sum: '$organizerPaise' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const row = (...cells) => cells.map(cell).join(',');
    const day = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
    const lines = [
      row('Settlement statement', summary.name),
      row('Event ID', eventId),
      row('Generated', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })),
      '',
      row('SUMMARY', 'Rupees'),
      row('Passes sold (net)', summary.passesSold),
      row('Gross collected', rupees(summary.grossPaise)),
      row('Platform fee', rupees(summary.platformPaise)),
      row('Organizer share (owed)', rupees(summary.owedPaise)),
      row('Paid out', rupees(summary.paidOutPaise)),
      row('Balance due', rupees(summary.balancePaise)),
      '',
      row('SALES BY DAY', 'Passes', 'Gross', 'Platform fee', 'Organizer share'),
      ...salesByDay.map(d => row(d._id, d.passes, rupees(d.grossPaise), rupees(d.platformPaise), rupees(d.organizerPaise))),
      '',
      row('PAYOUTS', 'Amount', 'Method', 'Reference', 'Recorded by', 'Note', 'Status', 'Void reason'),
      ...payouts.map(p => row(
        day(p.paidAt), rupees(p.amountPaise), p.method, p.reference, p.recordedBy?.name, p.note,
        p.voided ? 'VOIDED' : 'PAID', p.voidReason || ''
      ))
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="statement_${eventId}_${Date.now()}.csv"`);
    return res.status(200).send('﻿' + lines.join('\n') + '\n');
  } catch (error) {
    return errorResponse(res, error.message, 'STATEMENT_ERROR', 500);
  }
};
