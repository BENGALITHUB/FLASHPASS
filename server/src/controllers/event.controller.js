import { AdminSettings } from '../models/AdminSettings.js';
import { Event } from '../models/Event.js';
import { Pass } from '../models/Pass.js';
import { ScanLog } from '../models/ScanLog.js';
import { PASS_STATUS, SCAN_RESULTS } from '../constants/index.js';
import { calculatePassValidity, getCurrentEventDay } from '../utils/date.utils.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';

/**
 * GET /api/v1/event/all
 * Returns all active public events for the landing page showcase
 */
export const getAllPublicEvents = async (req, res) => {
  try {
    // Only events the super admin created are listed; none is made up when the list is empty.
    const events = await Event.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });

    const formatted = events.map(ev => {
      const basePrice = ev.basePricePaise || 5000;
      const platformFee = ev.platformFeePaise || 200;
      const totalPrice = basePrice + platformFee;
      return {
        eventId: ev.eventId,
        name: ev.name,
        venue: ev.venue,
        announcementText: ev.announcementText,
        eventDays: ev.eventDays,
        basePricePaise: basePrice,
        platformFeePaise: platformFee,
        totalPricePaise: totalPrice,
        basePriceRupees: (basePrice / 100).toFixed(2),
        platformFeeRupees: (platformFee / 100).toFixed(2),
        totalPriceRupees: (totalPrice / 100).toFixed(2),
        capacityLimit: ev.capacityLimit,
        allowReentry: ev.allowReentry,
        maxReentriesPerDay: ev.maxReentriesPerDay,
        status: ev.status,
        onlineSalesEnabled: ev.onlineSalesEnabled !== false && !ev.emergencyLockdown,
        ticketTiers: ev.ticketTiers?.filter(t => t.active) || [],
        addOns: ev.addOns?.filter(a => a.active) || [],
        coupons: ev.coupons?.filter(c => c.active) || [],
        liveAnnouncements: ev.liveAnnouncements?.filter(a => a.active) || [],
        emergencyEvacuation: ev.emergencyEvacuation || { active: false },
        cardDisplay: ev.cardDisplay || { showDays: true, showDailyCap: false, showTiers: false, customFields: [] },
        cardTemplate: ev.cardTemplate || null,
        paymentGateway: {
          provider: ev.paymentGateway?.provider || 'PAYU',
          enabled: ev.paymentGateway?.enabled !== false
        }
      };
    });

    return successResponse(res, formatted);
  } catch (error) {
    return errorResponse(res, error.message, 'EVENTS_FETCH_ERROR', 500);
  }
};

/**
 * GET /api/v1/event
 * Returns event details, dynamic pricing, tiers, add-ons, coupons & today's active badge
 */
export const getEventInfo = async (req, res) => {
  try {
    const { eventId, ref } = req.query;
    let event = null;
    if (eventId) {
      event = await Event.findOne({ eventId: String(eventId).trim().toLowerCase() });
    }
    if (!event) {
      event = await Event.findOne({ status: 'ACTIVE' }).sort({ createdAt: -1 });
    }

    const settings = await AdminSettings.getSettings();
    const eventName = event ? event.name : settings.eventName;
    const venue = event ? event.venue : settings.venue;
    const announcementText = event ? event.announcementText : settings.announcementText;
    const eventDays = (event && event.eventDays && event.eventDays.length > 0) ? event.eventDays : settings.eventDays;
    const currentDay = getCurrentEventDay(eventDays);
    const validity = calculatePassValidity(eventDays, settings.salesCutoffDay3);

    const basePrice = event ? event.basePricePaise : settings.basePricePaise;
    const platformFee = event ? event.platformFeePaise : settings.platformFeePaise;
    const totalPrice = basePrice + platformFee;

    // Check ambassador referral if provided
    let ambassador = null;
    if (ref && event?.affiliates) {
      const matched = event.affiliates.find(a => a.code === ref.trim().toLowerCase() && a.active);
      if (matched) {
        ambassador = {
          code: matched.code,
          name: matched.ambassadorName,
          commissionPct: matched.commissionPct
        };
      }
    }

    return successResponse(res, {
      // null when no event is on sale: the page shows no booking button rather than a made-up event.
      eventId: event ? event.eventId : null,
      name: eventName,
      eventName,
      venue,
      announcementText: announcementText || 'Tickets selling fast! Online passes valid for all 3 days.',
      eventDays,
      currentDay,
      salesOpen: Boolean(event) && event.status !== 'ARCHIVED' && validity.salesOpen && !settings.emergencyLockdown && event.onlineSalesEnabled !== false,
      salesReason: !event ? 'No event is on sale right now.' : event.status === 'ARCHIVED' ? 'This event has ended.' : settings.emergencyLockdown ? 'Sales temporarily paused by organizers.' : (validity.reason || null),
      todayBadge: validity.badge,
      validDaysForToday: validity.validDays,
      pricing: {
        basePricePaise: basePrice,
        platformFeePaise: platformFee,
        totalPricePaise: totalPrice,
        basePriceRupees: (basePrice / 100).toFixed(2),
        platformFeeRupees: (platformFee / 100).toFixed(2),
        totalPriceRupees: (totalPrice / 100).toFixed(2)
      },
      capacityLimit: event ? event.capacityLimit : settings.capacityLimit,
      onePassPerPhone: settings.onePassPerPhone,
      allowReentry: event ? event.allowReentry : settings.allowReentry,
      maxReentriesPerDay: event ? event.maxReentriesPerDay : settings.maxReentriesPerDay,
      emergencyLockdown: event ? event.emergencyLockdown : settings.emergencyLockdown,
      cashSalesEnabled: event ? event.cashSalesEnabled : settings.cashSalesEnabled,
      gateOpenTime: event ? event.gateOpenTime : settings.gateOpenTime,
      gateCloseTime: event ? event.gateCloseTime : settings.gateCloseTime,
      // 1. Multi-tier Ticket Categories
      ticketTiers: event?.ticketTiers?.filter(t => t.active) || [],
      // 2. Active Coupons
      coupons: event?.coupons?.filter(c => c.active) || [],
      // 3. Merch & Add-ons
      addOns: event?.addOns?.filter(a => a.active) || [],
      // 4. Multi-Zone setup
      zones: event?.zones || [],
      // 5. Live Announcements
      liveAnnouncements: event?.liveAnnouncements?.filter(a => a.active) || [],
      // 6. Emergency Evacuation status
      emergencyEvacuation: event?.emergencyEvacuation || { active: false },
      // 7. Payment Gateway Provider info
      paymentGateway: {
        provider: event?.paymentGateway?.provider || 'PAYU',
        enabled: event?.paymentGateway?.enabled !== false
      },
      // 8. Ambassador details
      ambassador
    });
  } catch (error) {
    return errorResponse(res, error.message, 'EVENT_INFO_ERROR', 500);
  }
};


// Aggregate counters are cheap but not free; cache them briefly for the public landing pages
let publicStatsCache = { at: 0, data: null };

/**
 * GET /api/v1/event/stats
 * Public platform-wide social-proof counters (real counts, no PII)
 */
export const getPublicStats = async (req, res) => {
  try {
    if (publicStatsCache.data && Date.now() - publicStatsCache.at < 60_000) {
      return successResponse(res, publicStatsCache.data);
    }

    const [eventsHosted, passesIssued, entriesScanned, fraudBlocked, settings] = await Promise.all([
      Event.countDocuments({}),
      Pass.countDocuments({ status: PASS_STATUS.ACTIVE }),
      ScanLog.countDocuments({ result: SCAN_RESULTS.ENTRY_OK }),
      ScanLog.countDocuments({ result: SCAN_RESULTS.ALREADY_INSIDE }),
      AdminSettings.getSettings()
    ]);

    const data = { eventsHosted, passesIssued, entriesScanned, fraudBlocked, partnerCommissionPct: settings.partnerCommissionPct ?? 10 };
    publicStatsCache = { at: Date.now(), data };
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message, 'STATS_FETCH_ERROR', 500);
  }
};
