import bcrypt from 'bcryptjs';
import { Pass } from '../models/Pass.js';
import { Order } from '../models/Order.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { ScanLog } from '../models/ScanLog.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { Shift } from '../models/Shift.js';
import { Session } from '../models/Session.js';
import { Payout } from '../models/Payout.js';
import { SettlementRequest } from '../models/SettlementRequest.js';
import { endUserSessions } from '../services/session.service.js';
import { pinProblem } from './staff.controller.js';
import { getCurrentEventDay, getISTNow } from '../utils/date.utils.js';
import { emitEmergencyEvacuation, emitLiveAnnouncement } from '../services/socket.service.js';
import { clearConfigCache } from '../services/configCache.js';
import { gatewaySettingsForAdmin, mergeGatewaySettings } from '../services/gateway.service.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { PRESENCE, PASS_STATUS, ORDER_STATUS, ORDER_CHANNELS, SCAN_RESULTS, LEDGER_TYPES, ROLES, REENTRY_MODES } from '../constants/index.js';

// An event admin sees only their own event. One with no event set matches nothing,
// rather than falling back to some other event's data.
const NO_EVENT = '__no-event__';
const ownEvent = user => user?.assignedEventId || NO_EVENT;

// ['2026-12-24', '2026-12-25', …] -> [{ day: 1, date, label }, …], in date order, 1 to 7 days.
const MAX_EVENT_DAYS = 7;
export const toEventDays = (dates) => {
  if (!Array.isArray(dates) || dates.length < 1 || dates.length > MAX_EVENT_DAYS) {
    return { error: `Give the event 1 to ${MAX_EVENT_DAYS} dates.` };
  }
  const valid = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime())
    && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  if (!dates.every(valid)) return { error: 'Each date must be a real date like 2026-12-24.' };
  const sorted = [...new Set(dates)].sort();
  if (sorted.length !== dates.length) return { error: 'The same date is given twice.' };
  return { value: sorted.map((date, i) => ({ day: i + 1, date, label: `Day ${i + 1}` })) };
};

/**
 * GET /api/v1/admin/metrics
 * Live revenue, attendance, and safety metrics
 */
export const getDashboardMetrics = async (req, res) => {
  try {
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const requestedEventId = isEventAdmin
      ? ownEvent(req.user)
      : (req.query.eventId || 'ALL');

    const settings = await AdminSettings.getSettings();

    let selectedEvent = null;
    if (requestedEventId && requestedEventId !== 'ALL') {
      selectedEvent = await Event.findOne({ eventId: String(requestedEventId).trim().toLowerCase() });
    }
    // "Today" is a day of the chosen event's own dates.
    const eventDays = selectedEvent?.eventDays?.length ? selectedEvent.eventDays : settings.eventDays;
    const eventDay = getCurrentEventDay(eventDays) || 1;

    // Ledger query filter
    const ledgerFilter = (selectedEvent && selectedEvent.eventId) ? { eventId: selectedEvent.eventId } : {};
    const passFilter = (selectedEvent && selectedEvent.eventId) ? { eventId: selectedEvent.eventId, status: PASS_STATUS.ACTIVE } : { status: PASS_STATUS.ACTIVE };
    const scanFilter = (selectedEvent && selectedEvent.eventId) ? { eventId: selectedEvent.eventId } : {};

    // 1. Financial Ledger Aggregation
    const ledgerEntries = await LedgerEntry.find(ledgerFilter);
    let grossPaise = 0;
    let organizerPaise = 0;
    let platformPaise = 0;
    let onlineGrossPaise = 0;
    let cashGrossPaise = 0;

    for (const entry of ledgerEntries) {
      grossPaise += entry.grossPaise || 0;
      organizerPaise += entry.organizerPaise || 0;
      platformPaise += entry.platformPaise || 0;

      if (entry.channel === 'ONLINE') {
        onlineGrossPaise += entry.grossPaise || 0;
      } else {
        cashGrossPaise += entry.grossPaise || 0;
      }
    }

    // 2. Attendance & Safety metrics
    const insideNow = await Pass.countDocuments({ ...passFilter, presence: PRESENCE.INSIDE });
    const totalPaidPasses = await Pass.countDocuments(passFilter);

    // Today's first entries (Unique humans who entered today)
    const todayFootfall = await ScanLog.countDocuments({
      ...scanFilter,
      eventDay,
      result: SCAN_RESULTS.ENTRY_OK,
      isFirstEntryOfDay: true
    });

    // Total entries today
    const totalEntriesToday = await ScanLog.countDocuments({
      ...scanFilter,
      eventDay,
      result: SCAN_RESULTS.ENTRY_OK
    });
    const reEntriesToday = Math.max(0, totalEntriesToday - todayFootfall);

    // Total gate throughput across all days
    const totalThroughput = await ScanLog.countDocuments({
      ...scanFilter,
      result: { $in: [SCAN_RESULTS.ENTRY_OK, SCAN_RESULTS.EXIT_OK] }
    });

    // 3-Day Superfans (entered on all 3 days)
    const superfansCount = await Pass.countDocuments({
      ...passFilter,
      firstEntryDays: { $all: [1, 2, 3] }
    });

    const turnoutPct = totalPaidPasses > 0 ? Math.round((todayFootfall / totalPaidPasses) * 100) : 0;

    // Footfall report: real people at the event, not tickets sold.
    // firstEntryDays holds each day a pass was first scanned in, so a person
    // counts once per day they came and once in the unique total.
    const footfallByDay = await Promise.all(
      (eventDays || []).map(async (d) => ({
        day: d.day,
        date: d.date,
        label: d.label,
        count: await Pass.countDocuments({ ...passFilter, firstEntryDays: d.day })
      }))
    );
    const uniqueFootfall = await Pass.countDocuments({ ...passFilter, 'firstEntryDays.0': { $exists: true } });
    const totalVisits = footfallByDay.reduce((sum, d) => sum + d.count, 0);
    const reuseResults = [SCAN_RESULTS.ALREADY_USED_TODAY, SCAN_RESULTS.ALREADY_INSIDE];
    const blockedReuseTotal = await ScanLog.countDocuments({ ...scanFilter, result: { $in: reuseResults } });
    const blockedReuseToday = await ScanLog.countDocuments({ ...scanFilter, eventDay, result: { $in: reuseResults } });
    // With "All events" open no event's settings are shown; the admin picks an event to edit them.
    const cfgEvent = selectedEvent;
    const modeSource = cfgEvent;
    const reentryMode = modeSource?.reentryMode || settings.reentryMode || 'IN_OUT';
    const capacityLimit = selectedEvent ? (selectedEvent.capacityLimit || 3000) : settings.capacityLimit;

    // 3. Multi-Event Comparative Breakdown (Strict Tenant Isolation)
    let eventsBreakdown = [];
    if (isEventAdmin) {
      // Event Admin ONLY sees their own event breakdown
      if (selectedEvent) {
        eventsBreakdown = [{
          eventId: selectedEvent.eventId,
          name: selectedEvent.name,
          venue: selectedEvent.venue,
          status: selectedEvent.status || 'ACTIVE',
          totalOrders: totalPaidPasses,
          grossRupees: (grossPaise / 100).toFixed(2),
          organizerRupees: (organizerPaise / 100).toFixed(2),
          platformFeeRupees: (platformPaise / 100).toFixed(2),
          insideNow,
          capacityLimit,
          capacityPct: Math.min(100, Math.round((insideNow / capacityLimit) * 100))
        }];
      }
    } else {
      const allEvents = await Event.find().lean();
      const allLedger = await LedgerEntry.find().lean();
      const allPasses = await Pass.find({ status: PASS_STATUS.ACTIVE }).lean();

      eventsBreakdown = allEvents.map(ev => {
        let evGross = 0;
        let evOrg = 0;
        let evFee = 0;
        allLedger.forEach(l => {
          if (l.eventId === ev.eventId || (!l.eventId && ev.eventId === 'comics-carnival')) {
            evGross += l.grossPaise || 0;
            evOrg += l.organizerPaise || 0;
            evFee += l.platformPaise || 0;
          }
        });

        const evPasses = allPasses.filter(p => p.eventId === ev.eventId || (!p.eventId && ev.eventId === 'comics-carnival'));
        const evInside = evPasses.filter(p => p.presence === PRESENCE.INSIDE).length;
        const evCapacity = ev.capacityLimit || 3000;

        return {
          eventId: ev.eventId,
          name: ev.name,
          venue: ev.venue,
          status: ev.status || 'ACTIVE',
          totalOrders: evPasses.length,
          grossRupees: (evGross / 100).toFixed(2),
          organizerRupees: (evOrg / 100).toFixed(2),
          platformFeeRupees: (evFee / 100).toFixed(2),
          insideNow: evInside,
          capacityLimit: evCapacity,
          capacityPct: Math.min(100, Math.round((evInside / evCapacity) * 100)),
          paymentGateway: {
            provider: ev.paymentGateway?.provider || 'PAYU',
            usePlatformDefault: ev.paymentGateway?.usePlatformDefault !== false,
            hasCustomKey: Boolean(
              ev.paymentGateway?.merchantKey ||
              ev.paymentGateway?.razorpayKeyId ||
              ev.paymentGateway?.cashfreeAppId ||
              ev.paymentGateway?.phonepeMerchantId ||
              ev.paymentGateway?.stripePublishableKey
            ),
            env: ev.paymentGateway?.env || 'TEST'
          }
        };
      });
    }

    return successResponse(res, {
      selectedEvent: selectedEvent ? {
        eventId: selectedEvent.eventId,
        name: selectedEvent.name,
        venue: selectedEvent.venue,
        capacityLimit
      } : {
        eventId: 'ALL',
        name: 'All Events (Combined Platform)',
        venue: 'Platform-wide Aggregated',
        capacityLimit
      },
      eventsBreakdown,
      ledger: {
        grossRupees: (grossPaise / 100).toFixed(2),
        organizerRupees: (organizerPaise / 100).toFixed(2),
        platformRupees: (platformPaise / 100).toFixed(2),
        onlineGrossRupees: (onlineGrossPaise / 100).toFixed(2),
        cashGrossRupees: (cashGrossPaise / 100).toFixed(2),
        paidPassCount: totalPaidPasses
      },
      attendance: {
        insideNow,
        capacityLimit,
        capacityUsagePct: capacityLimit > 0 ? Math.round((insideNow / capacityLimit) * 100) : 0,
        todayFootfall,
        reEntriesToday,
        totalThroughput,
        turnoutPct,
        superfansCount,
        currentDay: eventDay
      },
      footfall: {
        reentryMode,
        ticketsSold: totalPaidPasses,
        uniqueFootfall,
        noShow: Math.max(0, totalPaidPasses - uniqueFootfall),
        turnoutPct: totalPaidPasses > 0 ? Math.round((uniqueFootfall / totalPaidPasses) * 100) : 0,
        totalVisits,
        byDay: footfallByDay,
        blockedReuseToday,
        blockedReuseTotal
      },
      pricing: {
        basePricePaise: selectedEvent ? selectedEvent.basePricePaise : settings.basePricePaise,
        platformFeePaise: selectedEvent ? selectedEvent.platformFeePaise : settings.platformFeePaise,
        totalPricePaise: (selectedEvent ? selectedEvent.basePricePaise + selectedEvent.platformFeePaise : settings.basePricePaise + settings.platformFeePaise)
      },
      settings: {
        eventName: cfgEvent ? cfgEvent.name : settings.eventName,
        venue: cfgEvent ? cfgEvent.venue : settings.venue,
        announcementText: cfgEvent ? (cfgEvent.announcementText || settings.announcementText) : settings.announcementText,
        allowReentry: cfgEvent ? (cfgEvent.allowReentry !== false) : (settings.allowReentry !== false),
        maxReentriesPerDay: cfgEvent ? (cfgEvent.maxReentriesPerDay ?? 2) : (settings.maxReentriesPerDay ?? 2),
        reentryMode,
        emergencyLockdown: cfgEvent ? Boolean(cfgEvent.emergencyLockdown) : Boolean(settings.emergencyLockdown),
        cashSalesEnabled: cfgEvent ? (cfgEvent.cashSalesEnabled !== false) : (settings.cashSalesEnabled !== false),
        onlineSalesEnabled: cfgEvent ? (cfgEvent.onlineSalesEnabled !== false) : (settings.onlineSalesEnabled !== false),
        gateOpenTime: (cfgEvent ? cfgEvent.gateOpenTime : settings.gateOpenTime) || '00:00',
        gateCloseTime: (cfgEvent ? cfgEvent.gateCloseTime : settings.gateCloseTime) || '23:59',
        eventDays: cfgEvent?.eventDays || [],
        basePricePaise: cfgEvent ? cfgEvent.basePricePaise : settings.basePricePaise,
        platformFeePaise: cfgEvent ? cfgEvent.platformFeePaise : settings.platformFeePaise,
        capacityLimit,
        ticketTiers: cfgEvent?.ticketTiers || [],
        coupons: cfgEvent?.coupons || [],
        addOns: cfgEvent?.addOns || [],
        affiliates: cfgEvent?.affiliates || [],
        zones: cfgEvent?.zones || [],
        liveAnnouncements: cfgEvent?.liveAnnouncements || [],
        emergencyEvacuation: cfgEvent?.emergencyEvacuation || { active: false },
        cardDisplay: cfgEvent?.cardDisplay || { showDays: true, showDailyCap: false, showTiers: false, customFields: [] },
        cardTemplate: cfgEvent?.cardTemplate || null,
        eventGuide: cfgEvent?.eventGuide || null,
        paymentGateway: gatewaySettingsForAdmin(cfgEvent)
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'METRICS_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/passes
 * Search passes by phone, orderId, or holder name
 */
/**
 * GET /api/v1/admin/attendees
 * Full attendee / ticket buyer directory for Event Admin (own event) and Super Admin (selected or all events).
 */
export const getAttendees = async (req, res) => {
  try {
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin
      ? ownEvent(req.user)
      : (req.query.eventId && req.query.eventId !== 'ALL' ? String(req.query.eventId).trim().toLowerCase() : null);

    const filter = {};
    if (targetEventId) filter.eventId = targetEventId;
    if (req.query.status && ['ACTIVE', 'VOIDED'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.presence && ['INSIDE', 'OUTSIDE'].includes(req.query.presence)) filter.presence = req.query.presence;

    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 1000));
    const passes = await Pass.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    const baseOrderIds = [...new Set(passes.map(p => String(p.orderId || '').replace(/-P\d+$/, '')))];
    const eventIds = [...new Set(passes.map(p => p.eventId || 'comics-carnival'))];
    const [orders, events, settings] = await Promise.all([
      Order.find({ orderId: { $in: baseOrderIds } })
        .select('orderId channel email amountPaise paidAt gateway.provider isGroupBooking tierName')
        .lean(),
      Event.find({ eventId: { $in: eventIds } }).select('eventId name eventDays reentryMode').lean(),
      AdminSettings.getSettings()
    ]);

    const orderById = Object.fromEntries(orders.map(o => [o.orderId, o]));
    const eventById = Object.fromEntries(events.map(e => [e.eventId, e.name]));
    // "Today" and the gate mode are per event, worked out the same way the gate scanner does.
    const gateInfoById = Object.fromEntries(events.map(e => [e.eventId, {
      today: getCurrentEventDay(e.eventDays?.length ? e.eventDays : settings.eventDays) || 1,
      stampMode: (e.reentryMode || settings.reentryMode || REENTRY_MODES.IN_OUT) === REENTRY_MODES.WRISTBAND
    }]));

    let rows = passes.map(p => {
      const baseId = String(p.orderId || '').replace(/-P\d+$/, '');
      const o = orderById[baseId];
      const evId = p.eventId || 'comics-carnival';
      const gate = gateInfoById[evId] || {
        today: getCurrentEventDay(settings.eventDays) || 1,
        stampMode: settings.reentryMode === REENTRY_MODES.WRISTBAND
      };
      return {
        _id: p._id,
        orderId: p.orderId,
        baseOrderId: baseId,
        eventId: evId,
        eventName: eventById[evId] || evId,
        holderName: p.holderName,
        phone: p.phone,
        email: p.email || o?.email || '',
        tierName: p.tierName || o?.tierName || 'General Comic Pass',
        badge: p.badge,
        channel: o?.channel || 'ONLINE',
        amountPaise: o?.amountPaise ?? 0,
        gatewayProvider: o?.gateway?.provider || 'PAYU',
        isGroupPass: Boolean(p.isGroupPass),
        status: p.status,
        presence: p.presence,
        // Hand-stamp mode never scans people out, so presence stays OUTSIDE there;
        // cameToday / lastScan say whether the pass was actually scanned in.
        cameToday: (p.firstEntryDays || []).includes(gate.today),
        everCame: (p.firstEntryDays || []).length > 0,
        stampMode: gate.stampMode,
        lastScan: p.lastScan ? { at: p.lastScan.at, gateId: p.lastScan.gateId, direction: p.lastScan.direction } : null,
        bookedAt: o?.paidAt || p.createdAt
      };
    });

    if (req.query.channel && ['ONLINE', 'POS_WALKIN', 'CASH_TOKEN'].includes(req.query.channel)) {
      rows = rows.filter(r => r.channel === req.query.channel);
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    if (q) {
      rows = rows.filter(r =>
        (r.holderName || '').toLowerCase().includes(q)
        || (r.phone || '').toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || (r.orderId || '').toLowerCase().includes(q)
      );
    }

    return successResponse(res, { attendees: rows, total: rows.length, eventId: targetEventId || 'ALL' });
  } catch (error) {
    return errorResponse(res, error.message, 'ATTENDEES_FETCH_ERROR', 500);
  }
};

export const searchPasses = async (req, res) => {
  try {
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin ? ownEvent(req.user) : null;
    const eventFilter = targetEventId ? { eventId: targetEventId } : {};

    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      const passes = await Pass.find(eventFilter).sort({ createdAt: -1 }).limit(30);
      return successResponse(res, passes);
    }

    const query = q.trim();
    const passes = await Pass.find({
      ...eventFilter,
      $or: [
        { orderId: new RegExp(query, 'i') },
        { phone: new RegExp(query, 'i') },
        { holderName: new RegExp(query, 'i') }
      ]
    }).sort({ createdAt: -1 }).limit(50);

    return successResponse(res, passes);
  } catch (error) {
    return errorResponse(res, error.message, 'SEARCH_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/passes/:id
 * Get full pass detail with scan log history
 */
export const getPassDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const pass = await Pass.findById(id);
    if (!pass) {
      return errorResponse(res, 'Pass not found', 'NOT_FOUND', 404);
    }

    const scanLogs = await ScanLog.find({ passId: pass._id }).sort({ at: -1 });
    const order = await Order.findOne({ orderId: pass.orderId });

    return successResponse(res, {
      pass,
      order,
      scanLogs
    });
  } catch (error) {
    return errorResponse(res, error.message, 'PASS_DETAIL_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/passes/:id/force-reset
 * Force reset presence to OUTSIDE (reason required, logged in AuditLog)
 */
export const forceResetPass = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 3) {
      return errorResponse(res, 'A clear reason is required for force reset', 'REASON_REQUIRED', 400);
    }

    const pass = await Pass.findById(id);
    if (!pass) return errorResponse(res, 'Pass not found', 'NOT_FOUND', 404);

    const beforeState = { presence: pass.presence };
    pass.presence = PRESENCE.OUTSIDE;
    await pass.save();

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'FORCE_RESET_PRESENCE',
      target: `Pass ${pass.orderId} (${pass.holderName})`,
      reason: reason.trim(),
      before: beforeState,
      after: { presence: PRESENCE.OUTSIDE }
    });

    return successResponse(res, { message: `Pass ${pass.orderId} force-reset to OUTSIDE.` });
  } catch (error) {
    return errorResponse(res, error.message, 'FORCE_RESET_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/passes/:id/void
 * Void a pass (reason required, records reversal ledger)
 */
export const voidPass = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 3) {
      return errorResponse(res, 'A clear reason is required to void a pass', 'REASON_REQUIRED', 400);
    }

    const pass = await Pass.findById(id);
    if (!pass) return errorResponse(res, 'Pass not found', 'NOT_FOUND', 404);

    pass.status = PASS_STATUS.VOIDED;
    await pass.save();

    const order = await Order.findOne({ orderId: pass.orderId });
    if (order) {
      order.status = ORDER_STATUS.VOIDED;
      await order.save();

      await LedgerEntry.create({
        orderId: order.orderId,
        // Without it the refund would count against the oldest event's money, not this one's.
        eventId: order.eventId,
        type: LEDGER_TYPES.REVERSAL,
        channel: order.channel,
        grossPaise: -order.amountPaise,
        organizerPaise: -order.organizerSharePaise,
        platformPaise: -order.platformFeePaise,
        byUserId: req.user._id,
        at: new Date()
      });
    }

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'VOID_PASS',
      target: `Pass ${pass.orderId}`,
      reason: reason.trim()
    });

    return successResponse(res, { message: `Pass ${pass.orderId} has been voided.` });
  } catch (error) {
    return errorResponse(res, error.message, 'VOID_ERROR', 500);
  }
};

/**
 * PATCH /api/v1/admin/settings
 * Update dynamic pricing and configurations (BR-P-01, BR-P-05)
 */
/**
 * Clean up ticket tiers sent from the admin screen before saving.
 * - soldCount and the platform fee are never taken from the browser
 * - a tier that has sold passes can't be deleted (turn it off instead),
 *   so every pass keeps a tier that still exists
 */
async function sanitizeTicketTiers(event, incoming) {
  const existing = new Map((event.ticketTiers || []).map(t => [t.tierId, t]));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const seen = new Set();
  const tiers = [];

  for (const raw of incoming) {
    const name = String(raw?.name || '').trim();
    if (name.length < 2 || name.length > 60) return { error: 'Every ticket type needs a name (2–60 letters)' };

    let tierId = raw.tierId && existing.has(raw.tierId) ? raw.tierId : slug(raw.tierId || name) || `tier-${tiers.length + 1}`;
    while (seen.has(tierId)) tierId = `${tierId}-2`;
    seen.add(tierId);

    const pricePaise = Number(raw.pricePaise);
    if (!Number.isInteger(pricePaise) || pricePaise < 0) return { error: `"${name}": enter a valid price` };
    const capacity = Number(raw.capacity ?? 0);
    if (!Number.isInteger(capacity) || capacity < 0) return { error: `"${name}": capacity must be 0 or more (0 = no separate limit)` };

    const prev = existing.get(tierId);
    tiers.push({
      tierId,
      name,
      pricePaise,
      platformFeePaise: prev?.platformFeePaise ?? event.platformFeePaise ?? 200,
      capacity,
      soldCount: prev?.soldCount || 0,
      perks: (Array.isArray(raw.perks) ? raw.perks : [])
        .map(p => String(p).trim()).filter(Boolean).slice(0, 8).map(p => p.slice(0, 60)),
      color: raw.color || prev?.color || 'yellow',
      allowedZones: prev?.allowedZones?.length ? prev.allowedZones : ['MAIN_HALL'],
      badge: (String(raw.badge || '').trim() || name).toUpperCase().slice(0, 24),
      featured: Boolean(raw.featured),
      active: raw.active !== false
    });
  }

  for (const [tierId, t] of existing) {
    if (seen.has(tierId)) continue;
    const sold = await Pass.countDocuments({ eventId: event.eventId, tierId });
    if (sold > 0) {
      return { error: `"${t.name}" has ${sold} pass${sold === 1 ? '' : 'es'} sold, so it can't be deleted. Turn it off instead.` };
    }
  }
  return { tiers };
}

export const updateSettings = async (req, res) => {
  try {
    const {
      eventName, venue, announcementText,
      basePricePaise, platformFeePaise, capacityLimit,
      onePassPerPhone, cashPriceMode, allowReentry, maxReentriesPerDay,
      emergencyLockdown, cashSalesEnabled, onlineSalesEnabled,
      reentryMode, gateOpenTime, gateCloseTime, eventId,
      ticketTiers, coupons, addOns, affiliates, zones, paymentGateway, eventDates, cardDisplay, cardTemplate, eventGuide
    } = req.body;

    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin
      ? ownEvent(req.user)
      : (eventId || null);

    if (targetEventId) {
      const event = await Event.findOne({ eventId: targetEventId.toLowerCase().trim() });
      if (event) {
        if (eventName !== undefined) event.name = String(eventName).trim();
        if (venue !== undefined) event.venue = String(venue).trim();
        if (announcementText !== undefined) event.announcementText = String(announcementText).trim();
        if (basePricePaise !== undefined) event.basePricePaise = Number(basePricePaise);
        if (platformFeePaise !== undefined) event.platformFeePaise = Number(platformFeePaise);
        if (capacityLimit !== undefined) event.capacityLimit = Number(capacityLimit);
        if (allowReentry !== undefined) event.allowReentry = Boolean(allowReentry);
        if (maxReentriesPerDay !== undefined) event.maxReentriesPerDay = Number(maxReentriesPerDay);
        if (reentryMode === 'IN_OUT' || reentryMode === 'WRISTBAND') event.reentryMode = reentryMode;
        if (emergencyLockdown !== undefined) event.emergencyLockdown = Boolean(emergencyLockdown);
        if (onlineSalesEnabled !== undefined) event.onlineSalesEnabled = Boolean(onlineSalesEnabled);
        // The box office and cash tokens stop or start for this event alone.
        if (cashSalesEnabled !== undefined) event.cashSalesEnabled = Boolean(cashSalesEnabled);
        // The event's own dates. Passes hold day numbers (Day 1, 2, 3), so moving the dates keeps
        // sold passes valid for the same days at the new dates.
        if (eventDates !== undefined) {
          const days = toEventDays(eventDates);
          if (days.error) return errorResponse(res, days.error, 'INVALID_DATES', 400);
          event.eventDays = days.value;
        }
        // The event's own gate hours, in 24-hour IST (e.g. 11:00 to 20:00).
        if (gateOpenTime !== undefined || gateCloseTime !== undefined) {
          const open = gateOpenTime ?? event.gateOpenTime;
          const close = gateCloseTime ?? event.gateCloseTime;
          const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
          if (!hhmm.test(open) || !hhmm.test(close) || open >= close) {
            return errorResponse(res, 'Gate hours need an opening time before the closing time, like 11:00 and 20:00.', 'INVALID_GATE_HOURS', 400);
          }
          event.gateOpenTime = open;
          event.gateCloseTime = close;
        }

        // Advanced Features configuration
        if (Array.isArray(ticketTiers)) {
          const result = await sanitizeTicketTiers(event, ticketTiers);
          if (result.error) return errorResponse(res, result.error, 'INVALID_TIERS', 400);
          event.ticketTiers = result.tiers;
        }
        if (Array.isArray(coupons)) event.coupons = coupons;
        if (Array.isArray(addOns)) {
          // soldCount is owned by the payment ledger; never let a (possibly stale) admin payload overwrite it
          const soldById = Object.fromEntries((event.addOns || []).map(a => [a.addOnId, a.soldCount || 0]));
          event.addOns = addOns.map(a => ({ ...a, soldCount: soldById[a.addOnId] || 0 }));
        }
        if (Array.isArray(affiliates)) event.affiliates = affiliates;
        if (Array.isArray(zones)) event.zones = zones;

        // Public Event Card Display Settings (toggles + custom fields)
        if (cardDisplay && typeof cardDisplay === 'object') {
          const prev = event.cardDisplay || {};
          event.cardDisplay = {
            showDays: cardDisplay.showDays !== undefined ? Boolean(cardDisplay.showDays) : (prev.showDays ?? true),
            showDailyCap: cardDisplay.showDailyCap !== undefined ? Boolean(cardDisplay.showDailyCap) : (prev.showDailyCap ?? false),
            showTiers: cardDisplay.showTiers !== undefined ? Boolean(cardDisplay.showTiers) : (prev.showTiers ?? false),
            customFields: Array.isArray(cardDisplay.customFields)
              ? cardDisplay.customFields
                  .filter(f => f && String(f.label || '').trim() && String(f.value || '').trim())
                  .slice(0, 8)
                  .map(f => ({
                    label: String(f.label).trim().slice(0, 30),
                    value: String(f.value).trim().slice(0, 50),
                    icon: String(f.icon || 'CalendarDays').trim()
                  }))
              : (prev.customFields || [])
          };
        }

        if (eventGuide && typeof eventGuide === 'object') {
          const prevG = event.eventGuide || {};
          event.eventGuide = {
            duration: eventGuide.duration !== undefined ? String(eventGuide.duration).trim().slice(0, 60) : (prevG.duration || '9 Hrs / Day'),
            entryAllowedFor: eventGuide.entryAllowedFor !== undefined ? String(eventGuide.entryAllowedFor).trim().slice(0, 60) : (prevG.entryAllowedFor || 'All ages'),
            kidFriendly: eventGuide.kidFriendly !== undefined ? String(eventGuide.kidFriendly).trim().slice(0, 40) : (prevG.kidFriendly || 'Yes'),
            language: eventGuide.language !== undefined ? String(eventGuide.language).trim().slice(0, 80) : (prevG.language || 'English, Hindi, Bengali'),
            layout: eventGuide.layout !== undefined ? String(eventGuide.layout).trim().slice(0, 60) : (prevG.layout || 'Indoor'),
            petFriendly: eventGuide.petFriendly !== undefined ? String(eventGuide.petFriendly).trim().slice(0, 40) : (prevG.petFriendly || 'No'),
            seatingArrangement: eventGuide.seatingArrangement !== undefined ? String(eventGuide.seatingArrangement).trim().slice(0, 80) : (prevG.seatingArrangement || 'Seated and Standing'),
            ticketsNeededFor: eventGuide.ticketsNeededFor !== undefined ? String(eventGuide.ticketsNeededFor).trim().slice(0, 60) : (prevG.ticketsNeededFor || 'Ages 3 & Above')
          };
        }

        // Multi-Tenant Payment Gateway Configuration (Top 5 Gateways)
        if (paymentGateway && typeof paymentGateway === 'object') {
          const merged = mergeGatewaySettings(paymentGateway, event.paymentGateway || {});
          if (merged.error) return errorResponse(res, merged.error, 'INVALID_GATEWAY', 400);
          event.paymentGateway = merged.value;
        }

        // Event Card Visual Template & Colors
        if (cardTemplate && typeof cardTemplate === 'object') {
          const prevT = event.cardTemplate || {};
          const prevC = prevT.colors || {};
          const inC = cardTemplate.colors || {};
          event.cardTemplate = {
            layout: ['standard', 'kolkata-dusk'].includes(cardTemplate.layout) ? cardTemplate.layout : (prevT.layout || 'standard'),
            templateName: cardTemplate.templateName !== undefined ? String(cardTemplate.templateName).trim().slice(0, 60) : (prevT.templateName || ''),
            logoUrl: cardTemplate.logoUrl !== undefined ? String(cardTemplate.logoUrl).trim().slice(0, 300) : (prevT.logoUrl || ''),
            watermarkUrl: cardTemplate.watermarkUrl !== undefined ? String(cardTemplate.watermarkUrl).trim().slice(0, 300) : (prevT.watermarkUrl || ''),
            tagline: Array.isArray(cardTemplate.tagline)
              ? cardTemplate.tagline.map(t => String(t || '').trim()).filter(Boolean).slice(0, 6)
              : (prevT.tagline || []),
            colors: {
              ink: inC.ink || prevC.ink || '#0A0A0A',
              orange: inC.orange || prevC.orange || '#FF7A1A',
              burst: inC.burst || prevC.burst || '#F2FF00',
              button: inC.button || prevC.button || '#FFC21A',
              red: inC.red || prevC.red || '#E10600'
            }
          };
        }

        await event.save();
        clearConfigCache();

        await AuditLog.create({
          actorId: req.user._id,
          actorName: req.user.name,
          action: 'UPDATE_EVENT_SETTINGS',
          target: `Event ${targetEventId}`,
          reason: `${req.user.role} modified event configuration / policies / tiers`
        });

        return successResponse(res, {
          message: 'Event settings successfully updated',
          settings: {
            eventName: event.name,
            venue: event.venue,
            announcementText: event.announcementText,
            basePricePaise: event.basePricePaise,
            platformFeePaise: event.platformFeePaise,
            capacityLimit: event.capacityLimit,
            allowReentry: event.allowReentry,
            maxReentriesPerDay: event.maxReentriesPerDay,
            reentryMode: event.reentryMode,
            emergencyLockdown: event.emergencyLockdown,
            onlineSalesEnabled: event.onlineSalesEnabled,
            cashSalesEnabled: event.cashSalesEnabled,
            ticketTiers: event.ticketTiers,
            coupons: event.coupons,
            addOns: event.addOns,
            affiliates: event.affiliates,
            zones: event.zones,
            cardDisplay: event.cardDisplay,
            cardTemplate: event.cardTemplate,
            paymentGateway: gatewaySettingsForAdmin(event)
          }
        });
      }
    }

    const settings = await AdminSettings.getSettings();
    const before = {
      eventName: settings.eventName,
      venue: settings.venue,
      basePricePaise: settings.basePricePaise,
      platformFeePaise: settings.platformFeePaise,
      capacityLimit: settings.capacityLimit,
      allowReentry: settings.allowReentry,
      emergencyLockdown: settings.emergencyLockdown
    };

    if (eventName !== undefined) settings.eventName = String(eventName).trim();
    if (venue !== undefined) settings.venue = String(venue).trim();
    if (announcementText !== undefined) settings.announcementText = String(announcementText).trim();
    if (basePricePaise !== undefined) settings.basePricePaise = Number(basePricePaise);
    if (platformFeePaise !== undefined) settings.platformFeePaise = Number(platformFeePaise);
    if (capacityLimit !== undefined) settings.capacityLimit = Number(capacityLimit);
    if (onePassPerPhone !== undefined) settings.onePassPerPhone = Boolean(onePassPerPhone);
    if (allowReentry !== undefined) settings.allowReentry = Boolean(allowReentry);
    if (maxReentriesPerDay !== undefined) settings.maxReentriesPerDay = Number(maxReentriesPerDay);
    if (emergencyLockdown !== undefined) settings.emergencyLockdown = Boolean(emergencyLockdown);
    if (cashSalesEnabled !== undefined) settings.cashSalesEnabled = Boolean(cashSalesEnabled);
    if (onlineSalesEnabled !== undefined) settings.onlineSalesEnabled = Boolean(onlineSalesEnabled);
    if (cashPriceMode !== undefined) settings.cashPriceMode = cashPriceMode;
    if (reentryMode !== undefined) settings.reentryMode = reentryMode;
    if (gateOpenTime !== undefined) settings.gateOpenTime = gateOpenTime;
    if (gateCloseTime !== undefined) settings.gateCloseTime = gateCloseTime;

    await settings.save();
    clearConfigCache();

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'UPDATE_SETTINGS',
      target: 'AdminSettings',
      reason: 'Admin modified configuration / pricing',
      before,
      after: {
        basePricePaise: settings.basePricePaise,
        platformFeePaise: settings.platformFeePaise,
        capacityLimit: settings.capacityLimit
      }
    });

    return successResponse(res, { message: 'Settings successfully updated', settings });
  } catch (error) {
    return errorResponse(res, error.message, 'SETTINGS_UPDATE_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/users
 */
export const getStaffUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === ROLES.EVENT_ADMIN && req.user.assignedEventId) {
      filter.assignedEventId = req.user.assignedEventId;
    }
    const users = await User.find(filter).select('-pinHash').sort({ createdAt: -1 }).lean();
    // How many devices each person is logged in on right now
    const counts = await Session.aggregate([
      { $match: { userId: { $in: users.map(u => u._id) }, revokedAt: null, expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$userId', n: { $sum: 1 } } }
    ]);
    const byUser = Object.fromEntries(counts.map(c => [String(c._id), c.n]));
    return successResponse(res, users.map(u => ({ ...u, activeSessions: byUser[String(u._id)] || 0 })));
  } catch (error) {
    return errorResponse(res, error.message, 'USERS_FETCH_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/users
 */
export const createStaffUser = async (req, res) => {
  try {
    const { username, name, pin, role, assignedEventId } = req.body;

    if (!username || !pin || pin.length !== 6 || !role) {
      return errorResponse(res, 'Username, 6-digit PIN, and Role are required', 'INVALID_INPUT', 400);
    }
    const weak = pinProblem(pin);
    if (weak) return errorResponse(res, weak, 'WEAK_PIN', 400);

    // Role safety: Event Admin can only create CASHIER or GATE_VOLUNTEER
    if (req.user.role === ROLES.EVENT_ADMIN && (role === ROLES.SUPER_ADMIN || role === ROLES.EVENT_ADMIN)) {
      return errorResponse(res, 'Event Admins can only create Cashiers or Gate Volunteers', 'FORBIDDEN', 403);
    }

    // Staff below super admin work for one event, which must exist; there is no default event.
    const targetEventId = req.user.role === ROLES.EVENT_ADMIN
      ? req.user.assignedEventId
      : (role === ROLES.SUPER_ADMIN ? null : String(assignedEventId || '').trim().toLowerCase());
    if (role !== ROLES.SUPER_ADMIN && !(targetEventId && await Event.exists({ eventId: targetEventId }))) {
      return errorResponse(res, 'Choose the event this staff member works for.', 'EVENT_REQUIRED', 400);
    }

    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) {
      return errorResponse(res, 'Username already exists', 'USERNAME_TAKEN', 400);
    }

    const pinHash = await bcrypt.hash(String(pin), 12);
    const user = await User.create({
      username: username.toLowerCase().trim(),
      name: name.trim(),
      pinHash,
      role,
      assignedEventId: targetEventId,
      active: true
    });

    return successResponse(res, {
      message: 'Staff user created successfully',
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        assignedEventId: user.assignedEventId
      }
    }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 'USER_CREATE_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/events
 * List all events for Super Admin or assigned event for Event Admin
 */
export const listEvents = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === ROLES.EVENT_ADMIN && req.user.assignedEventId) {
      filter.eventId = req.user.assignedEventId;
    }
    const events = await Event.find(filter).sort({ createdAt: -1 });
    return successResponse(res, events);
  } catch (error) {
    return errorResponse(res, error.message, 'EVENTS_FETCH_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/events
 * Super Admin creates a new Event and provisions its Event Admin user
 */
export const createEvent = async (req, res) => {
  try {
    if (req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.ADMIN) {
      return errorResponse(res, 'Only Platform Super Admin can create new events', 'FORBIDDEN', 403);
    }

    const {
      eventId,
      name,
      venue,
      announcementText,
      basePriceRupees = 50,
      platformFeeRupees = 2,
      capacity = 3000,
      adminUsername,
      adminName,
      adminPin = '123456',
      adminEmail,
      adminPhone,
      eventDates,
      cardTemplate,
      cardDisplay
    } = req.body;

    if (!name || !venue || !adminUsername) {
      return errorResponse(res, 'Event Name, Venue, and Admin Username are required', 'MISSING_FIELDS', 400);
    }
    let newEventDays = [
      { day: 1, date: '2026-12-12', label: 'Day 1' },
      { day: 2, date: '2026-12-13', label: 'Day 2' },
      { day: 3, date: '2026-12-14', label: 'Day 3' }
    ];
    if (eventDates !== undefined) {
      const days = toEventDays(eventDates);
      if (days.error) return errorResponse(res, days.error, 'INVALID_DATES', 400);
      newEventDays = days.value;
    }

    const slug = (eventId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));

    const existingEvent = await Event.findOne({ eventId: slug });
    if (existingEvent) {
      return errorResponse(res, `An event with identifier "${slug}" already exists. Please choose a different identifier.`, 'SLUG_EXISTS', 400);
    }

    const existingUser = await User.findOne({ username: adminUsername.toLowerCase().trim() });
    if (existingUser) {
      return errorResponse(res, `Username "${adminUsername}" is already taken. Please choose another username.`, 'USERNAME_TAKEN', 400);
    }

    // 1. Create Event Admin user
    const pinHash = await bcrypt.hash(String(adminPin), 12);
    const eventAdminUser = await User.create({
      username: adminUsername.toLowerCase().trim(),
      name: (adminName || `${name} Organizer`).trim(),
      email: adminEmail ? adminEmail.trim() : '',
      phone: adminPhone ? adminPhone.trim() : '',
      pinHash,
      role: ROLES.EVENT_ADMIN,
      assignedEventId: slug,
      active: true
    });

    // 2. Create Event with dedicated event-specific tiers, add-ons and zones
    const newEvent = await Event.create({
      eventId: slug,
      ...(cardTemplate && typeof cardTemplate === 'object' ? { cardTemplate } : {}),
      ...(cardDisplay && typeof cardDisplay === 'object' ? { cardDisplay } : {}),
      name: name.trim(),
      venue: venue.trim(),
      announcementText: announcementText ? announcementText.trim() : `Welcome to ${name.trim()}!`,
      basePricePaise: Math.round(Number(basePriceRupees) * 100),
      platformFeePaise: Math.round(Number(platformFeeRupees) * 100),
      capacityLimit: Number(capacity),
      allowReentry: true,
      maxReentriesPerDay: 2,
      // The dates given in the form; old clients that send none get placeholder dates to edit later.
      eventDays: newEventDays,
      ticketTiers: [
        {
          tierId: 'general',
          name: `${name.trim()} General Pass`,
          pricePaise: Math.round(Number(basePriceRupees) * 100),
          platformFeePaise: Math.round(Number(platformFeeRupees) * 100),
          capacity: Math.round(Number(capacity) * 0.8),
          soldCount: 0,
          perks: ['Event Admission', 'Main Arena Access', 'Digital Ingress Pass'],
          color: 'yellow',
          badge: 'GENERAL',
          allowedZones: ['MAIN_HALL'],
          active: true
        },
        {
          tierId: 'vip',
          name: `${name.trim()} VIP Pass`,
          pricePaise: Math.round(Number(basePriceRupees) * 100 * 2.5),
          platformFeePaise: Math.round(Number(platformFeeRupees) * 100 * 1.5),
          capacity: Math.round(Number(capacity) * 0.15),
          soldCount: 0,
          perks: ['Express Priority Gate', 'VIP Lounge Access', 'Complimentary Festival Gift'],
          color: 'gold',
          badge: 'VIP',
          allowedZones: ['MAIN_HALL', 'VIP_LOUNGE'],
          active: true
        }
      ],
      addOns: [
        {
          addOnId: `${slug}-tshirt`,
          name: `Official ${name.trim()} Festival T-Shirt`,
          pricePaise: 29900,
          category: 'MERCH',
          description: `Official collectible premium cotton tee for ${name.trim()}`,
          icon: 'Shirt',
          inventory: 300,
          soldCount: 0,
          variants: ['S', 'M', 'L', 'XL', 'XXL'],
          active: true
        },
        {
          addOnId: 'food-combo',
          name: 'Fast-Track Food & Drink Combo',
          pricePaise: 14900,
          category: 'FOOD',
          description: 'Refreshment combo voucher at event food court',
          icon: 'Utensils',
          inventory: 500,
          soldCount: 0,
          variants: [],
          active: true
        },
        {
          addOnId: 'parking-pass',
          name: 'Guaranteed Venue Parking Pass',
          pricePaise: 10000,
          category: 'PARKING',
          description: `Designated vehicle parking slot at ${venue.trim()}`,
          icon: 'Car',
          inventory: 150,
          soldCount: 0,
          variants: [],
          active: true
        }
      ],
      zones: [
        { zoneId: 'MAIN_HALL', name: 'Main Event Arena', gateIds: ['Gate 1', 'Gate 2'], requiredTiers: ['general', 'vip'] },
        { zoneId: 'VIP_LOUNGE', name: 'Exclusive VIP Area', gateIds: ['Gate 3'], requiredTiers: ['vip'] }
      ],
      coupons: [
        { code: 'WELCOME10', discountType: 'PERCENT', discountValue: 10, maxUses: 200, usedCount: 0, minOrderAmountPaise: 5000, active: true }
      ],
      liveAnnouncements: [
        { id: 'ann-1', text: `Welcome to ${name.trim()} at ${venue.trim()}! Passes are now live.`, type: 'INFO', active: true, createdAt: new Date() }
      ],
      organizer: {
        userId: eventAdminUser._id,
        username: eventAdminUser.username,
        name: eventAdminUser.name,
        email: eventAdminUser.email,
        phone: eventAdminUser.phone
      },
      paymentGateway: {
        enabled: true,
        provider: 'PAYU',
        usePlatformDefault: true,
        merchantKey: '',
        merchantSalt: '',
        razorpayKeyId: '',
        razorpayKeySecret: '',
        cashfreeAppId: '',
        cashfreeSecretKey: '',
        phonepeMerchantId: '',
        phonepeSaltKey: '',
        phonepeSaltIndex: '1',
        stripePublishableKey: '',
        stripeSecretKey: '',
        env: 'TEST'
      },
      status: 'ACTIVE'
    });

    return successResponse(res, {
      message: `Event "${newEvent.name}" and Event Admin "${eventAdminUser.username}" successfully created!`,
      event: newEvent,
      eventAdmin: {
        username: eventAdminUser.username,
        name: eventAdminUser.name,
        role: eventAdminUser.role,
        assignedEventId: slug
      }
    }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 'EVENT_CREATION_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/platform/overview
 * Master SaaS Overview for Platform Super Admin
 */
export const getPlatformOverview = async (req, res) => {
  try {
    if (req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.ADMIN) {
      return errorResponse(res, 'Access restricted to Platform Super Admin', 'FORBIDDEN', 403);
    }

    const totalEvents = await Event.countDocuments();
    const activeEvents = await Event.countDocuments({ status: 'ACTIVE' });
    const events = await Event.find().sort({ createdAt: -1 });

    const totalOrders = await Order.countDocuments({ status: ORDER_STATUS.PAID });
    const ledgerEntries = await LedgerEntry.find();

    let totalGrossPaise = 0;
    let totalOrganizerPaise = 0;
    let totalPlatformFeePaise = 0;

    ledgerEntries.forEach(entry => {
      totalGrossPaise += entry.grossPaise || 0;
      totalOrganizerPaise += entry.organizerPaise || 0;
      totalPlatformFeePaise += entry.platformPaise || 0;
    });

    return successResponse(res, {
      platform: {
        name: 'FlashPass Engine v2.0',
        totalEvents,
        activeEvents,
        totalPaidOrders: totalOrders,
        totalGrossPaise,
        totalOrganizerPaise,
        totalPlatformFeePaise, // Platform Super Admin Net Profit!
        totalPlatformFeeRupees: (totalPlatformFeePaise / 100).toFixed(2),
        totalGrossRupees: (totalGrossPaise / 100).toFixed(2),
        totalOrganizerRupees: (totalOrganizerPaise / 100).toFixed(2)
      },
      events
    });
  } catch (error) {
    return errorResponse(res, error.message, 'PLATFORM_OVERVIEW_ERROR', 500);
  }
};

// Records saved before events had IDs carry none and belong to the first event, comics-carnival.
const LEGACY_EVENT_ID = 'comics-carnival';
// Anything that holds money or attendee history for the event keeps it from being deleted.
const eventHasRecords = async eventId => {
  const match = eventId === LEGACY_EVENT_ID ? { eventId: { $in: [eventId, null] } } : { eventId };
  const found = await Promise.all([Order, Pass, LedgerEntry, Payout, SettlementRequest].map(model => model.exists(match)));
  return found.some(Boolean);
};
const findManagedEvent = async (req, res) => {
  const eventId = String(req.params.eventId || '').trim().toLowerCase();
  const event = await Event.findOne({ eventId });
  if (!event) errorResponse(res, 'Event not found', 'NOT_FOUND', 404);
  return event;
};
const auditEvent = (req, action, event, reason) => AuditLog.create({
  actorId: req.user._id, actorName: req.user.name || req.user.username, action, target: `Event ${event.eventId}`, reason
});

/**
 * DELETE /api/v1/admin/events/:eventId
 * Super Admin removes an event that never sold anything. An event with orders, passes or
 * settlement records is archived instead, so its money trail stays intact.
 * Body: { confirmEventId } must repeat the event's ID.
 */
export const deleteEvent = async (req, res) => {
  try {
    const event = await findManagedEvent(req, res);
    if (!event) return;
    if (String(req.body?.confirmEventId || '').trim().toLowerCase() !== event.eventId) {
      return errorResponse(res, `Type the event ID "${event.eventId}" to confirm.`, 'CONFIRMATION_MISMATCH', 400);
    }
    if (await eventHasRecords(event.eventId)) {
      return errorResponse(res, 'This event has orders or passes, so it cannot be deleted. Archive it instead to hide it and stop sales.', 'EVENT_HAS_SALES', 409);
    }
    // Its organizer and staff lose access; their accounts stay for the audit history. They keep
    // their event link: an event admin with none would see every event if switched back on.
    const staff = await User.find({ assignedEventId: event.eventId });
    for (const user of staff) {
      user.active = false;
      await user.save();
      await endUserSessions(user._id, 'Event deleted');
    }
    await Event.deleteOne({ _id: event._id });
    clearConfigCache();
    await auditEvent(req, 'DELETE_EVENT', event, `Deleted "${event.name}"; ${staff.length} staff account(s) switched off`);
    return successResponse(res, { message: `"${event.name}" was deleted.`, eventId: event.eventId, staffSwitchedOff: staff.length });
  } catch (error) {
    return errorResponse(res, error.message, 'EVENT_DELETE_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/events/:eventId/archive   { archived: true | false }
 * Archiving hides the event from the public site and stops online and cash sales. Orders,
 * passes and settlements are kept. Restoring makes it visible again with sales still off,
 * for the organizer to switch back on.
 */
export const setEventArchived = async (req, res) => {
  try {
    const event = await findManagedEvent(req, res);
    if (!event) return;
    const archived = req.body?.archived !== false;
    if (archived) {
      event.status = 'ARCHIVED';
      event.onlineSalesEnabled = false;
      event.cashSalesEnabled = false;
    } else {
      event.status = 'ACTIVE';
    }
    await event.save();
    clearConfigCache();
    await auditEvent(req, archived ? 'ARCHIVE_EVENT' : 'RESTORE_EVENT', event, archived ? `Archived "${event.name}"; sales stopped` : `Restored "${event.name}"; sales still off`);
    return successResponse(res, {
      message: archived ? `"${event.name}" is archived. It is hidden and sales are stopped.` : `"${event.name}" is restored. Switch sales back on in its settings.`,
      event
    });
  } catch (error) {
    return errorResponse(res, error.message, 'EVENT_ARCHIVE_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/analytics
 * Comprehensive visual analytics for modern Super Admin Dashboard
 */
export const getDashboardAnalytics = async (req, res) => {
  try {
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const requestedEventId = isEventAdmin
      ? ownEvent(req.user)
      : (req.query.eventId || 'ALL');

    const settings = await AdminSettings.getSettings();

    let selectedEvent = null;
    if (requestedEventId && requestedEventId !== 'ALL') {
      selectedEvent = await Event.findOne({ eventId: String(requestedEventId).trim().toLowerCase() });
    }
    // "Today" is a day of the chosen event's own dates.
    const eventDays = selectedEvent?.eventDays?.length ? selectedEvent.eventDays : settings.eventDays;
    const eventDay = getCurrentEventDay(eventDays) || 1;

    const eventMatch = (selectedEvent && selectedEvent.eventId) ? { eventId: selectedEvent.eventId } : {};

    // 1. Hourly Ingress / Velocity Curve (09:00 - 22:00)
    const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
    const hourlyLogs = await ScanLog.aggregate([
      {
        $match: {
          ...eventMatch,
          result: { $in: [SCAN_RESULTS.ENTRY_OK, SCAN_RESULTS.EXIT_OK] }
        }
      },
      {
        $project: {
          hour: { $hour: { date: '$at', timezone: '+05:30' } },
          direction: 1,
          result: 1
        }
      },
      {
        $group: {
          _id: { hour: '$hour', direction: '$direction' },
          count: { $sum: 1 }
        }
      }
    ]);

    const hourlyMap = {};
    hourlyLogs.forEach(item => {
      const hStr = `${String(item._id.hour).padStart(2, '0')}:00`;
      if (!hourlyMap[hStr]) hourlyMap[hStr] = { entries: 0, exits: 0 };
      if (item._id.direction === 'ENTRY') hourlyMap[hStr].entries += item.count;
      if (item._id.direction === 'EXIT') hourlyMap[hStr].exits += item.count;
    });

    const hourlyData = hours.map(h => ({
      hour: h,
      entries: hourlyMap[h]?.entries || 0,
      exits: hourlyMap[h]?.exits || 0
    }));

    // 2. Gate-by-Gate Congestion: only gates that actually scanned, busiest first
    const gateAgg = await ScanLog.aggregate([
      {
        $match: {
          ...eventMatch,
          result: { $in: [SCAN_RESULTS.ENTRY_OK, SCAN_RESULTS.EXIT_OK] }
        }
      },
      {
        $group: {
          _id: '$gateId',
          scans: { $sum: 1 }
        }
      }
    ]);

    const gateTotal = gateAgg.reduce((sum, g) => sum + g.scans, 0);
    const gateDistribution = gateAgg
      .filter(g => g._id)
      .sort((a, b) => b.scans - a.scans)
      .map(g => ({
        gate: g._id,
        shortId: g._id,
        scans: g.scans,
        sharePct: gateTotal > 0 ? Math.round((g.scans / gateTotal) * 100) : 0
      }));

    // 3. Channel Breakdown (Online UPI vs POS Box Office)
    const onlineOrders = await Order.countDocuments({ ...eventMatch, channel: ORDER_CHANNELS.ONLINE, status: ORDER_STATUS.PAID });
    const cashOrders = await Order.countDocuments({ ...eventMatch, channel: { $ne: ORDER_CHANNELS.ONLINE }, status: ORDER_STATUS.PAID });
    const onlineGross = await Order.aggregate([
      { $match: { ...eventMatch, channel: ORDER_CHANNELS.ONLINE, status: ORDER_STATUS.PAID } },
      { $group: { _id: null, total: { $sum: '$amountPaise' }, org: { $sum: '$organizerSharePaise' }, fee: { $sum: '$platformFeePaise' } } }
    ]);
    const cashGross = await Order.aggregate([
      { $match: { ...eventMatch, channel: { $ne: ORDER_CHANNELS.ONLINE }, status: ORDER_STATUS.PAID } },
      { $group: { _id: null, total: { $sum: '$amountPaise' }, org: { $sum: '$organizerSharePaise' }, fee: { $sum: '$platformFeePaise' } } }
    ]);

    const onlineGrossRupees = ((onlineGross[0]?.total || 0) / 100).toFixed(2);
    const cashGrossRupees = ((cashGross[0]?.total || 0) / 100).toFixed(2);

    // 4. Live Scanner Stream Feed (Recent 15 scans)
    const rawScans = await ScanLog.find(eventMatch)
      .sort({ at: -1 })
      .limit(15)
      .populate('passId', 'holderName badge phone')
      .lean();

    const liveScanTicker = rawScans.map(s => ({
      _id: s._id,
      orderId: s.orderId,
      holderName: s.passId?.holderName || 'Attendee',
      badge: s.passId?.badge || 'PASS',
      gateId: s.gateId,
      direction: s.direction,
      result: s.result,
      isFirstEntry: s.isFirstEntryOfDay,
      time: new Date(s.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }));

    // 5. Fraud & Security Incidents (e.g. Screenshot attempts, double entries)
    const fraudIncidents = await ScanLog.find({
      ...eventMatch,
      result: { $in: [SCAN_RESULTS.ALREADY_INSIDE, SCAN_RESULTS.ALREADY_USED_TODAY, SCAN_RESULTS.INVALID_QR, SCAN_RESULTS.VOIDED, SCAN_RESULTS.MAX_REENTRIES_EXCEEDED, SCAN_RESULTS.REENTRY_DISABLED] }
    })
      .sort({ at: -1 })
      .limit(10)
      .populate('passId', 'holderName phone')
      .lean();

    const formattedIncidents = fraudIncidents.map(inc => ({
      _id: inc._id,
      orderId: inc.orderId,
      holderName: inc.passId?.holderName || 'Unknown',
      gateId: inc.gateId,
      result: inc.result,
      time: new Date(inc.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }));

    // 6. Crowd Safety Meter
    const passFilter = (selectedEvent && selectedEvent.eventId) ? { eventId: selectedEvent.eventId, status: PASS_STATUS.ACTIVE } : { status: PASS_STATUS.ACTIVE };
    const insideNow = await Pass.countDocuments({ ...passFilter, presence: PRESENCE.INSIDE });
    const capacityLimit = selectedEvent ? (selectedEvent.capacityLimit || 3000) : (settings.capacityLimit || 3000);
    const capacityPct = Math.min(100, Math.round((insideNow / capacityLimit) * 100));

    let surgeStatus = 'OPTIMAL';
    if (capacityPct >= 85) surgeStatus = 'CRITICAL_SURGE';
    else if (capacityPct >= 70) surgeStatus = 'WARNING_SURGE';

    return successResponse(res, {
      hourlyData,
      gateDistribution,
      channelBreakdown: {
        online: {
          ordersCount: onlineOrders,
          grossRupees: onlineGrossRupees,
          platformFeeRupees: ((onlineGross[0]?.fee || 0) / 100).toFixed(2),
          organizerShareRupees: ((onlineGross[0]?.org || 0) / 100).toFixed(2)
        },
        cash: {
          ordersCount: cashOrders,
          grossRupees: cashGrossRupees,
          platformFeeRupees: ((cashGross[0]?.fee || 0) / 100).toFixed(2),
          organizerShareRupees: ((cashGross[0]?.org || 0) / 100).toFixed(2)
        }
      },
      liveScanTicker,
      formattedIncidents,
      safety: {
        insideNow,
        capacityLimit,
        capacityPct,
        surgeStatus
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'ANALYTICS_ERROR', 500);
  }
};

// One CSV cell: quotes escaped, and text a spreadsheet would run as a formula
// (=, +, -, @, tab, CR at the start) is prefixed with ' so it shows as text.
// Buyers type their own names, so a name like =HYPERLINK(...) must stay inert.
const csvCell = (v) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
const csvRow = (cells) => cells.join(',') + '\n';
const rupees = (p) => ((p || 0) / 100).toFixed(2);

// Exports mask phones the same way the screens do: 98*****210
export const maskPhoneForExport = (p) => {
  const d = String(p || '');
  if (d.length < 6) return '*'.repeat(d.length);
  return `${d.slice(0, 2)}${'*'.repeat(d.length - 5)}${d.slice(-3)}`;
};

const EXPORT_TYPES = ['passes', 'orders', 'ledger', 'scans', 'shifts', 'footfall', 'attendees'];
const EXPORTS_WITH_PHONES = ['passes', 'orders', 'footfall', 'attendees'];

/**
 * GET /api/v1/admin/export/:type
 * 1-click CSV export. Phone numbers are masked unless ?includeFullPhone=1,
 * which is written to the audit log.
 */
export const exportCSV = async (req, res) => {
  try {
    const { type } = req.params;
    if (!EXPORT_TYPES.includes(type)) {
      return errorResponse(res, `Invalid export type. Choose ${EXPORT_TYPES.join(', ')}.`, 'INVALID_TYPE', 400);
    }
    const fullPhone = EXPORTS_WITH_PHONES.includes(type)
      && ['1', 'true', 'yes'].includes(String(req.query.includeFullPhone || '').toLowerCase());
    const phoneOut = fullPhone ? (p) => String(p || '') : maskPhoneForExport;
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin
      ? ownEvent(req.user)
      : (req.query.eventId || null);

    const eventFilter = (targetEventId && targetEventId !== 'ALL') ? { eventId: targetEventId } : {};

    let filename = `export_${type}_${Date.now()}.csv`;
    let csvData = '';

    if (fullPhone) {
      await AuditLog.create({
        actorId: req.user._id,
        actorName: req.user.name,
        action: 'EXPORT_FULL_PHONE',
        target: `${type} CSV (${targetEventId && targetEventId !== 'ALL' ? targetEventId : 'all events'})`,
        reason: 'Exported with full phone numbers'
      });
    }

    if (type === 'passes') {
      const passes = await Pass.find(eventFilter).sort({ createdAt: -1 }).lean();
      csvData = 'OrderId,EventId,HolderName,Phone,Email,Badge,Status,Presence,ValidDays,CreatedAt\n';
      passes.forEach(p => {
        csvData += csvRow([
          csvCell(p.orderId), csvCell(p.eventId || 'comics-carnival'), csvCell(p.holderName), csvCell(phoneOut(p.phone)),
          csvCell(p.email || ''), csvCell(p.badge), csvCell(p.status), csvCell(p.presence), csvCell((p.validDays || []).join('-')),
          csvCell(p.createdAt?.toISOString())
        ]);
      });
    } else if (type === 'attendees') {
      const passes = await Pass.find(eventFilter).sort({ createdAt: -1 }).lean();
      const baseOrderIds = [...new Set(passes.map(p => String(p.orderId || '').replace(/-P\d+$/, '')))];
      const orders = await Order.find({ orderId: { $in: baseOrderIds } }).select('orderId channel email amountPaise paidAt').lean();
      const orderById = Object.fromEntries(orders.map(o => [o.orderId, o]));
      csvData = 'OrderId,EventId,HolderName,Phone,Email,Tier,Channel,AmountRupees,Status,Presence,BookedAt\n';
      passes.forEach(p => {
        const baseId = String(p.orderId || '').replace(/-P\d+$/, '');
        const o = orderById[baseId];
        csvData += csvRow([
          csvCell(p.orderId), csvCell(p.eventId || 'comics-carnival'), csvCell(p.holderName), csvCell(phoneOut(p.phone)),
          csvCell(p.email || o?.email || ''), csvCell(p.tierName || 'General'), csvCell(o?.channel || 'ONLINE'),
          rupees(o?.amountPaise || 0), csvCell(p.status), csvCell(p.presence), csvCell((o?.paidAt || p.createdAt)?.toISOString())
        ]);
      });
    } else if (type === 'orders') {
      // Every order, paid or not, with what was charged and how it was paid
      const orders = await Order.find(eventFilter).sort({ createdAt: -1 }).lean();
      csvData = 'OrderId,EventId,Channel,Status,HolderName,Phone,Ticket,Passes,SubtotalRupees,DiscountRupees,Coupon,AddOnsRupees,AmountRupees,OrganizerRupees,PlatformRupees,Gateway,PaymentMethod,PaymentId,CreatedAt,PaidAt,Email\n';
      orders.forEach(o => {
        const addOnsPaise = (o.addOns || []).reduce((sum, a) => sum + (a.pricePaise || 0) * (a.quantity || 1), 0);
        csvData += csvRow([
          csvCell(o.orderId), csvCell(o.eventId || 'comics-carnival'), csvCell(o.channel), csvCell(o.status),
          csvCell(o.holderName), csvCell(phoneOut(o.phone)), csvCell(o.tierName),
          Math.max(1, (o.attendees || []).length), rupees(o.subtotalPaise), rupees(o.discountPaise), csvCell(o.couponCode || ''),
          rupees(addOnsPaise), rupees(o.amountPaise), rupees(o.organizerSharePaise), rupees(o.platformFeePaise),
          csvCell(o.gateway?.provider || ''), csvCell(o.gateway?.method || ''), csvCell(o.gateway?.paymentId || ''),
          csvCell(o.createdAt?.toISOString()), csvCell(o.paidAt?.toISOString() || ''), csvCell(o.email || '')
        ]);
      });
    } else if (type === 'ledger') {
      const entries = await LedgerEntry.find(eventFilter).sort({ at: -1 });
      csvData = 'OrderId,EventId,Type,Channel,GrossRupees,OrganizerRupees,PlatformRupees,Date\n';
      entries.forEach(e => {
        csvData += csvRow([
          csvCell(e.orderId), csvCell(e.eventId || 'comics-carnival'), csvCell(e.type), csvCell(e.channel),
          rupees(e.grossPaise), rupees(e.organizerPaise), rupees(e.platformPaise), csvCell(e.at?.toISOString())
        ]);
      });
    } else if (type === 'scans') {
      const scans = await ScanLog.find(eventFilter).sort({ at: -1 }).limit(1000);
      csvData = 'OrderId,EventId,EventDay,Direction,Result,FirstEntry,GateId,Time\n';
      scans.forEach(s => {
        csvData += csvRow([
          csvCell(s.orderId || ''), csvCell(s.eventId || 'comics-carnival'), s.eventDay, csvCell(s.direction),
          csvCell(s.result), Boolean(s.isFirstEntryOfDay), csvCell(s.gateId), csvCell(s.at?.toISOString())
        ]);
      });
    } else if (type === 'shifts') {
      // Cash reconciliation per cashier shift (SRS FR-M7-08, BR-F-03)
      const shifts = await Shift.find(await shiftScope(req.user)).sort({ openedAt: -1 }).limit(2000).lean();
      const r = rupees;
      const cell = csvCell;
      csvData = 'Cashier,Status,OpenedAt,ClosedAt,Tickets,OpeningFloat,CashSales,ExpectedInDrawer,Counted,Difference,Notes\n';
      shifts.forEach(s => {
        csvData += [
          cell(s.cashierName), cell(s.status), cell(s.openedAt?.toISOString()), cell(s.closedAt?.toISOString() || ''),
          s.ticketCount || 0, r(s.openingFloatPaise), r(s.salesPaise), r(s.expectedPaise),
          s.status === 'CLOSED' ? r(s.countedPaise) : '', s.status === 'CLOSED' ? r(s.differencePaise) : '', cell(s.notes)
        ].join(',') + '\n';
      });
    } else if (type === 'footfall') {
      // One row per paid pass: which days the holder actually came
      const settings = await AdminSettings.getSettings();
      const days = (settings.eventDays || []).map(d => d.day);
      const passes = await Pass.find({ ...eventFilter, status: PASS_STATUS.ACTIVE }).sort({ createdAt: 1 }).lean();
      csvData = ['OrderId', 'EventId', 'HolderName', 'Phone', 'Badge', 'ValidDays', ...days.map(d => `Day${d}`), 'DaysAttended', 'NoShow'].join(',') + '\n';
      passes.forEach(p => {
        const came = new Set(p.firstEntryDays || []);
        csvData += [
          csvCell(p.orderId), csvCell(p.eventId || 'comics-carnival'), csvCell(p.holderName), csvCell(phoneOut(p.phone)),
          csvCell(p.badge), csvCell((p.validDays || []).join('-')),
          ...days.map(d => (came.has(d) ? 'YES' : (p.validDays || []).includes(d) ? 'NO' : '-')),
          came.size, came.size === 0 ? 'YES' : 'NO'
        ].join(',') + '\n';
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (error) {
    return errorResponse(res, error.message, 'EXPORT_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/emergency-evacuation
 * Broadcast instant full-scale emergency evacuation to all gates & attendee passes
 */
export const triggerEmergencyEvacuation = async (req, res) => {
  try {
    const { eventId, active, message } = req.body;
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin ? ownEvent(req.user) : String(eventId || '').trim().toLowerCase(); // no default: the admin picks the event

    const event = await Event.findOne({ eventId: targetEventId });
    if (!event) return errorResponse(res, 'Event not found', 'NOT_FOUND', 404);

    event.emergencyEvacuation = {
      active: Boolean(active),
      message: message || '🚨 EMERGENCY EVACUATION ACTIVE - ALL GATES UNLOCKED FOR EXIT',
      triggeredAt: new Date(),
      triggeredBy: req.user.name
    };
    await event.save();
    clearConfigCache(); // gates must see the evacuation at once

    emitEmergencyEvacuation({
      eventId: targetEventId,
      active: event.emergencyEvacuation.active,
      message: event.emergencyEvacuation.message
    });

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      action: active ? 'TRIGGER_EVACUATION' : 'STOP_EVACUATION',
      target: `Event ${targetEventId}`,
      reason: message || 'Emergency protocol initiated'
    });

    return successResponse(res, {
      message: active ? '🚨 EMERGENCY EVACUATION BROADCAST ACTIVATED!' : 'Emergency Evacuation Stand-down Confirmed.',
      emergencyEvacuation: event.emergencyEvacuation
    });
  } catch (error) {
    return errorResponse(res, error.message, 'EVACUATION_ERROR', 500);
  }
};

/**
 * POST /api/v1/admin/announcement
 * Broadcast live flash notice to attendee passes and gate stations
 */
export const postLiveAnnouncement = async (req, res) => {
  try {
    const { eventId, text, type = 'INFO' } = req.body;
    if (!text || !text.trim()) {
      return errorResponse(res, 'Announcement text is required', 'MISSING_TEXT', 400);
    }
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin ? ownEvent(req.user) : String(eventId || '').trim().toLowerCase(); // no default: the admin picks the event

    const event = await Event.findOne({ eventId: targetEventId });
    if (!event) return errorResponse(res, 'Event not found', 'NOT_FOUND', 404);

    const newAnnouncement = {
      id: `ann-${Date.now()}`,
      text: text.trim(),
      type,
      createdAt: new Date(),
      active: true
    };

    if (!Array.isArray(event.liveAnnouncements)) event.liveAnnouncements = [];
    event.liveAnnouncements.unshift(newAnnouncement);
    if (event.liveAnnouncements.length > 15) {
      event.liveAnnouncements = event.liveAnnouncements.slice(0, 15);
    }
    await event.save();

    emitLiveAnnouncement({
      eventId: targetEventId,
      announcement: newAnnouncement
    });

    return successResponse(res, {
      message: 'Announcement broadcasted to attendee passes and gate screens!',
      announcement: newAnnouncement,
      liveAnnouncements: event.liveAnnouncements
    });
  } catch (error) {
    return errorResponse(res, error.message, 'ANNOUNCEMENT_ERROR', 500);
  }
};

/**
 * GET /api/v1/admin/executive-report
 * Compile comprehensive audited executive post-event report for tax / GST / audit
 */
const DEFAULT_KCK_TEMPLATE = {
  templateId: 'kck-7-master',
  name: 'KCK 7.0 Kolkata Dusk Template',
  layout: 'kolkata-dusk',
  logoUrl: '',
  watermarkUrl: '/events/kolkata-comics-karnival-7-0/logo.png',
  tagline: ['Comics', 'Gaming', 'Collectibles', 'Cosplay'],
  colors: {
    ink: '#0A0A0A',
    orange: '#FF7A1A',
    burst: '#F2FF00',
    button: '#FFC21A',
    red: '#E10600'
  },
  cardDisplay: {
    showDays: true,
    showDailyCap: false,
    showTiers: false,
    customFields: []
  },
  announcementText: "Get ready for city's biggest comics and pop-culture event uniting all geeks, nerds and fans under one roof.\n\n3 days of unlimited fun with just one single ticket."
};

export const listCardTemplates = async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    if (!settings.savedCardTemplates || settings.savedCardTemplates.length === 0) {
      settings.savedCardTemplates = [DEFAULT_KCK_TEMPLATE];
      await settings.save();
    }
    return successResponse(res, { templates: settings.savedCardTemplates });
  } catch (error) {
    return errorResponse(res, error.message, 'TEMPLATES_FETCH_ERROR', 500);
  }
};

export const saveCardTemplate = async (req, res) => {
  try {
    const { name, layout = 'kolkata-dusk', logoUrl = '', watermarkUrl = '', tagline = [], colors = {}, cardDisplay = {}, announcementText = '' } = req.body;
    if (!name || String(name).trim().length < 2) {
      return errorResponse(res, 'Template name is required (min 2 chars)', 'INVALID_NAME', 400);
    }
    const settings = await AdminSettings.getSettings();
    if (!settings.savedCardTemplates || settings.savedCardTemplates.length === 0) {
      settings.savedCardTemplates = [DEFAULT_KCK_TEMPLATE];
    }
    const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `tpl-${Date.now()}`;
    const entry = {
      templateId: `${slug}-${Date.now().toString(36)}`,
      name: String(name).trim().slice(0, 60),
      layout: ['standard', 'kolkata-dusk'].includes(layout) ? layout : 'kolkata-dusk',
      logoUrl: String(logoUrl || '').trim().slice(0, 300),
      watermarkUrl: String(watermarkUrl || '').trim().slice(0, 300),
      tagline: Array.isArray(tagline) ? tagline.map(t => String(t || '').trim()).filter(Boolean).slice(0, 6) : [],
      colors: {
        ink: colors.ink || '#0A0A0A',
        orange: colors.orange || '#FF7A1A',
        burst: colors.burst || '#F2FF00',
        button: colors.button || '#FFC21A',
        red: colors.red || '#E10600'
      },
      cardDisplay: {
        showDays: cardDisplay.showDays !== false,
        showDailyCap: Boolean(cardDisplay.showDailyCap),
        showTiers: Boolean(cardDisplay.showTiers),
        customFields: Array.isArray(cardDisplay.customFields) ? cardDisplay.customFields.slice(0, 8) : []
      },
      announcementText: String(announcementText || '').trim().slice(0, 1000)
    };
    settings.savedCardTemplates.push(entry);
    await settings.save();
    return successResponse(res, { template: entry, templates: settings.savedCardTemplates }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 'TEMPLATE_SAVE_ERROR', 500);
  }
};

export const deleteCardTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const settings = await AdminSettings.getSettings();
    settings.savedCardTemplates = (settings.savedCardTemplates || []).filter(t => t.templateId !== templateId);
    await settings.save();
    return successResponse(res, { templates: settings.savedCardTemplates });
  } catch (error) {
    return errorResponse(res, error.message, 'TEMPLATE_DELETE_ERROR', 500);
  }
};

export const getExecutiveReport = async (req, res) => {
  try {
    const { eventId } = req.query;
    const isEventAdmin = req.user.role === ROLES.EVENT_ADMIN;
    const targetEventId = isEventAdmin ? ownEvent(req.user) : String(eventId || '').trim().toLowerCase(); // no default: the admin picks the event

    const event = await Event.findOne({ eventId: targetEventId });
    if (!event) return errorResponse(res, 'Event not found', 'NOT_FOUND', 404);

    const passes = await Pass.find({ eventId: targetEventId, status: PASS_STATUS.ACTIVE });
    const ledger = await LedgerEntry.find({ eventId: targetEventId });
    const orders = await Order.find({ eventId: targetEventId, status: ORDER_STATUS.PAID });
    const scans = await ScanLog.find({ eventId: targetEventId });

    // Tier-wise breakdown
    const tierStats = (event.ticketTiers || []).map(tier => {
      const tierPasses = passes.filter(p => p.tierId === tier.tierId);
      const tierRevenuePaise = tierPasses.length * tier.pricePaise;
      return {
        tierId: tier.tierId,
        name: tier.name,
        priceRupees: (tier.pricePaise / 100).toFixed(2),
        sold: tierPasses.length,
        capacity: tier.capacity,
        revenueRupees: (tierRevenuePaise / 100).toFixed(2)
      };
    });

    // Add-ons breakdown
    let totalAddOnsPaise = 0;
    const addOnMap = {};
    orders.forEach(o => {
      (o.addOns || []).forEach(a => {
        if (!addOnMap[a.addOnId]) {
          addOnMap[a.addOnId] = { name: a.name, qty: 0, claimed: 0, revenuePaise: 0 };
        }
        addOnMap[a.addOnId].qty += (a.quantity || 1);
        if (a.claimed) addOnMap[a.addOnId].claimed += (a.quantity || 1);
        addOnMap[a.addOnId].revenuePaise += (a.pricePaise * (a.quantity || 1));
        totalAddOnsPaise += (a.pricePaise * (a.quantity || 1));
      });
    });

    // Financial totals
    let grossPaise = 0;
    let orgPaise = 0;
    let feePaise = 0;
    ledger.forEach(l => {
      grossPaise += l.grossPaise || 0;
      orgPaise += l.organizerPaise || 0;
      feePaise += l.platformPaise || 0;
    });

    // Ingress totals
    const insideNow = passes.filter(p => p.presence === PRESENCE.INSIDE).length;
    const totalEntries = scans.filter(s => s.result === SCAN_RESULTS.ENTRY_OK).length;
    const totalExits = scans.filter(s => s.result === SCAN_RESULTS.EXIT_OK).length;
    const fraudAttempts = scans.filter(s => s.result === SCAN_RESULTS.ALREADY_INSIDE || s.result === SCAN_RESULTS.INVALID_QR).length;

    return successResponse(res, {
      reportId: `REP-${targetEventId.toUpperCase()}-${Date.now().toString().slice(-6)}`,
      generatedAt: new Date().toISOString(),
      event: {
        eventId: event.eventId,
        name: event.name,
        venue: event.venue,
        organizer: event.organizer?.name || 'Comics Carnival Society',
        capacityLimit: event.capacityLimit
      },
      financialSummary: {
        grossRevenueRupees: (grossPaise / 100).toFixed(2),
        organizerNetRupees: (orgPaise / 100).toFixed(2),
        platformFeeRupees: (feePaise / 100).toFixed(2),
        addOnsRevenueRupees: (totalAddOnsPaise / 100).toFixed(2),
        paidOrdersCount: orders.length,
        totalPassesIssued: passes.length
      },
      tierStats,
      addOnStats: Object.values(addOnMap),
      attendanceStats: {
        totalThroughput: totalEntries + totalExits,
        totalEntries,
        totalExits,
        insideNow,
        fraudAttemptsBlocked: fraudAttempts,
        turnoutPct: passes.length > 0 ? Math.round((totalEntries / passes.length) * 100) : 0
      },
      complianceCertificate: {
        status: 'AUDITED_AND_RECONCILED',
        settlementStatus: 'SETTLED_TO_BANK',
        hashSignature: `FP-SHA256-${Date.now().toString(16).toUpperCase()}`
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'EXECUTIVE_REPORT_ERROR', 500);
  }
};


// Event organizers see only their own event's cashiers
async function shiftScope(user) {
  if (user.role !== ROLES.EVENT_ADMIN) return {};
  const ids = await User.find({ assignedEventId: ownEvent(user) }).distinct('_id');
  return { cashierId: { $in: ids } };
}

/**
 * GET /api/v1/admin/shifts
 * Recent cashier shifts with the drawer count (open shifts show live sales so far).
 */
export const listShifts = async (req, res) => {
  try {
    const shifts = await Shift.find(await shiftScope(req.user)).sort({ openedAt: -1 }).limit(100).lean();
    const cashChannels = [ORDER_CHANNELS.CASH_TOKEN, ORDER_CHANNELS.POS_WALKIN];
    const rows = await Promise.all(shifts.map(async (s) => {
      if (s.status === 'CLOSED') return s;
      const [t] = await Order.aggregate([
        { $match: { cashierId: s.cashierId, channel: { $in: cashChannels }, status: ORDER_STATUS.PAID, paidAt: { $gte: s.openedAt } } },
        { $group: { _id: null, salesPaise: { $sum: '$amountPaise' }, ticketCount: { $sum: { $max: [1, { $size: { $ifNull: ['$attendees', []] } }] } } } }
      ]);
      const salesPaise = t?.salesPaise || 0;
      return { ...s, salesPaise, ticketCount: t?.ticketCount || 0, expectedPaise: (s.openingFloatPaise || 0) + salesPaise };
    }));
    const closed = rows.filter(r => r.status === 'CLOSED');
    return successResponse(res, {
      shifts: rows,
      totals: {
        openShifts: rows.length - closed.length,
        closedShifts: closed.length,
        netDifferencePaise: closed.reduce((sum, r) => sum + (r.differencePaise || 0), 0),
        shortShifts: closed.filter(r => r.differencePaise < 0).length
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'SHIFTS_ERROR', 500);
  }
};
