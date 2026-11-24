import { Pass } from '../models/Pass.js';
import { Event } from '../models/Event.js';
import { generateQRToken } from '../services/qr.service.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { PASS_STATUS } from '../constants/index.js';

/**
 * GET /api/v1/passes/:orderId
 * Retrieve pass by Order ID with full group pass, tier, add-ons and announcement data
 */
export const getPassByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { phone } = req.query;
    const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : null;

    const pass = await Pass.findOne({ orderId, status: PASS_STATUS.ACTIVE });

    if (!pass) {
      return errorResponse(res, 'Active pass not found for this Order ID', 'NOT_FOUND', 404);
    }

    const event = await Event.findOne({ eventId: pass.eventId || 'comics-carnival' });

    // Look for sibling group passes. Only strip a trailing "-P<n>": random order IDs can contain "-P" too.
    const baseOrderId = pass.orderId.replace(/-P\d+$/, '');
    const isSubPass = pass.orderId !== baseOrderId;

    // Build sibling query
    const siblingQuery = {
      $or: [{ orderId: baseOrderId }, { orderId: new RegExp(`^${baseOrderId}-P\\d+$`) }],
      status: PASS_STATUS.ACTIVE
    };

    // If accessed via a specific phone number, or if this is an attendee sub-pass (-P<n>):
    // only return passes that match the specific phone number so other people's tickets never leak!
    const effectivePhone = cleanPhone || (isSubPass ? pass.phone : null);
    if (effectivePhone) {
      siblingQuery.phone = effectivePhone;
    }

    const siblingPasses = await Pass.find(siblingQuery).sort({ groupIndex: 1 });

    const qrToken = generateQRToken(pass._id.toString(), pass.qrNonce);

    const groupPasses = siblingPasses.map(p => ({
      passId: p._id,
      orderId: p.orderId,
      holderName: p.holderName,
      phone: p.phone,
      maskedPhone: p.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
      badge: p.badge,
      tierId: p.tierId,
      tierName: p.tierName,
      allowedZones: p.allowedZones,
      validDays: p.validDays,
      status: p.status,
      presence: p.presence,
      addOns: p.addOns || [],
      qrToken: generateQRToken(p._id.toString(), p.qrNonce),
      isGroupPass: p.isGroupPass,
      groupIndex: p.groupIndex
    }));

    return successResponse(res, {
      passId: pass._id,
      orderId: pass.orderId,
      holderName: pass.holderName,
      phone: pass.phone,
      maskedPhone: pass.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
      badge: pass.badge,
      tierId: pass.tierId,
      tierName: pass.tierName,
      allowedZones: pass.allowedZones,
      validDays: pass.validDays,
      status: pass.status,
      presence: pass.presence,
      lastScan: pass.lastScan,
      firstEntryDays: pass.firstEntryDays,
      addOns: pass.addOns || [],
      isGroupPass: pass.isGroupPass,
      groupIndex: pass.groupIndex,
      qrToken,
      groupPasses: groupPasses.length > 1 ? groupPasses : [],
      // The pass, its PDF and its picture show the event it is actually for.
      event: event ? { eventId: event.eventId, name: event.name, venue: event.venue || '', eventDays: event.eventDays || [] } : null,
      liveAnnouncements: event?.liveAnnouncements?.filter(a => a.active) || [],
      emergencyEvacuation: event?.emergencyEvacuation || { active: false }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'PASS_FETCH_ERROR', 500);
  }
};

/**
 * POST /api/v1/passes/my-ticket
 * Look up pass by Mobile Number (and optional Order ID)
 */
export const myTicketLookup = async (req, res) => {
  try {
    const { phone, orderId } = req.body;

    if (!phone && !orderId) {
      return errorResponse(res, 'Please provide your 10-digit registered mobile number', 'MISSING_FIELDS', 400);
    }

    const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : null;
    const cleanOrderId = orderId ? String(orderId).trim().toUpperCase() : null;

    if (cleanPhone && cleanPhone.length !== 10 && !cleanOrderId) {
      return errorResponse(res, 'Please enter a valid 10-digit mobile number', 'INVALID_PHONE', 400);
    }

    const query = { status: PASS_STATUS.ACTIVE };
    if (cleanPhone && cleanOrderId) {
      query.phone = cleanPhone;
      query.orderId = cleanOrderId;
    } else if (cleanOrderId) {
      query.orderId = cleanOrderId;
    } else if (cleanPhone) {
      query.phone = cleanPhone;
    }

    const passes = await Pass.find(query).sort({ createdAt: -1 });

    if (!passes || passes.length === 0) {
      return errorResponse(res, 'No active digital pass found for this mobile number.', 'PASS_NOT_FOUND', 404);
    }

    // If only one pass found, return direct pass info
    if (passes.length === 1) {
      const pass = passes[0];
      const qrToken = generateQRToken(pass._id.toString(), pass.qrNonce);

      return successResponse(res, {
        multiple: false,
        passId: pass._id,
        orderId: pass.orderId,
        eventId: pass.eventId,
        holderName: pass.holderName,
        phone: pass.phone,
        maskedPhone: pass.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
        badge: pass.badge,
        tierName: pass.tierName,
        validDays: pass.validDays,
        status: pass.status,
        presence: pass.presence,
        qrToken
      });
    }

    // Multiple passes found for this phone: enrich with event titles
    const eventIds = [...new Set(passes.map(p => p.eventId || 'comics-carnival'))];
    const events = await Event.find({ eventId: { $in: eventIds } });
    const eventMap = {};
    const venueMap = {};
    events.forEach(e => {
      eventMap[e.eventId] = e.name || e.title || e.eventId;
      venueMap[e.eventId] = e.venue || '';
    });

    return successResponse(res, {
      multiple: true,
      count: passes.length,
      passes: passes.map(p => ({
        passId: p._id,
        orderId: p.orderId,
        eventId: p.eventId || 'comics-carnival',
        eventName: eventMap[p.eventId || 'comics-carnival'] || p.eventId || 'Live Event',
        venue: venueMap[p.eventId || 'comics-carnival'] || '',
        holderName: p.holderName,
        phone: p.phone,
        badge: p.badge,
        tierName: p.tierName,
        validDays: p.validDays,
        status: p.status,
        presence: p.presence,
        createdAt: p.createdAt
      }))
    });
  } catch (error) {
    return errorResponse(res, error.message, 'RECOVERY_ERROR', 500);
  }
};

