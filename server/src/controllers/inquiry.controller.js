import crypto from 'crypto';
import { Inquiry, INQUIRY_TYPES } from '../models/Inquiry.js';
import { Event } from '../models/Event.js';
import { emitNewInquiry } from '../services/socket.service.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { AuditLog } from '../models/AuditLog.js';
import { ROLES, DEFAULT_ADMIN_SETTINGS, STALL_OPTIONS } from '../constants/index.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';

// Deal types the platform takes a commission on when they are closed
const COMMISSIONABLE_TYPES = ['SPONSOR', 'STALL'];

/**
 * Public: Submit a Sponsor or Stall Inquiry
 * POST /api/v1/inquiries
 */
export const createInquiry = async (req, res) => {
  try {
    const {
      eventId = 'platform', // a lead with no event is for the platform itself
      type,
      brandName,
      contactPerson,
      phone,
      email,
      category,
      stallType,
      sponsorshipTier,
      budget,
      priceNote,
      message
    } = req.body;

    if (!type || !INQUIRY_TYPES.includes(String(type).toUpperCase())) {
      return errorResponse(res, `Inquiry type must be one of ${INQUIRY_TYPES.join(', ')}`, 'INVALID_TYPE', 400);
    }

    if (!brandName || brandName.trim().length < 2) {
      return errorResponse(res, 'Please provide your Brand or Business Name', 'INVALID_BRAND', 400);
    }

    if (!contactPerson || contactPerson.trim().length < 2) {
      return errorResponse(res, 'Please provide the Contact Person name', 'INVALID_CONTACT', 400);
    }

    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return errorResponse(res, 'Please enter a valid 10-digit mobile number', 'INVALID_PHONE', 400);
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return errorResponse(res, 'Please enter a valid email address', 'INVALID_EMAIL', 400);
    }

    const targetEventId = String(eventId || 'platform').trim().toLowerCase();
    const event = await Event.findOne({ eventId: targetEventId });
    const eventName = event
      ? event.name
      : targetEventId === 'platform'
      ? 'FlashPass Platform'
      : targetEventId === 'comics-carnival' ? '3-Day Comics Carnival' : targetEventId;

    // A stall's price comes from the fixed price list, never from the request
    const isStall = type.toUpperCase() === 'STALL';
    const stall = isStall ? STALL_OPTIONS.find(s => s.id === String(stallType || '').trim()) : null;
    if (isStall && !stall) {
      return errorResponse(res, 'Please choose a stall size', 'INVALID_STALL_TYPE', 400);
    }

    const inquiryId = `INQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const inquiry = await Inquiry.create({
      inquiryId,
      eventId: targetEventId,
      eventName,
      type: type.toUpperCase(),
      brandName: brandName.trim(),
      contactPerson: contactPerson.trim(),
      phone: cleanPhone,
      email: email.trim().toLowerCase(),
      category: category ? String(category).trim() : 'GENERAL',
      stallType: stall ? stall.id : undefined,
      stallLabel: stall ? stall.label : undefined,
      stallPriceRupees: stall ? stall.priceRupees : undefined,
      priceNote: isStall && priceNote ? String(priceNote).trim().slice(0, 500) : undefined,
      sponsorshipTier: sponsorshipTier ? String(sponsorshipTier).trim() : undefined,
      budget: budget ? String(budget).trim() : undefined,
      message: message ? String(message).trim() : undefined,
      status: 'NEW',
      isRead: false
    });

    // Notify connected admin dashboards in real time via Socket.io
    emitNewInquiry(inquiry);

    return successResponse(res, {
      inquiryId: inquiry.inquiryId,
      eventId: inquiry.eventId,
      eventName: inquiry.eventName,
      type: inquiry.type,
      brandName: inquiry.brandName,
      stallLabel: inquiry.stallLabel,
      stallPriceRupees: inquiry.stallPriceRupees,
      message: 'Inquiry submitted successfully! Our event organizing team will contact you shortly.'
    }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 'INQUIRY_CREATE_FAILED', 500);
  }
};

/**
 * Admin: List Inquiries with Event-Scope Isolation & Metrics
 * GET /api/v1/inquiries
 */
export const getInquiries = async (req, res) => {
  try {
    const { eventId, type, status, page = 1, limit = 50 } = req.query;

    const query = {};

    // Scope check: Event Admins can ONLY see their assigned event
    if (req.user.role === 'EVENT_ADMIN') {
      query.eventId = req.user.assignedEventId || '__no-event__';
    } else if (eventId && eventId !== 'ALL') {
      // Super Admin filtered to a specific event
      query.eventId = String(eventId).trim().toLowerCase();
    }

    if (type && INQUIRY_TYPES.includes(type.toUpperCase())) {
      query.type = type.toUpperCase();
    }

    if (status && ['NEW', 'CONTACTED', 'ACCEPTED', 'REJECTED'].includes(status.toUpperCase())) {
      query.status = status.toUpperCase();
    }

    const inquiries = await Inquiry.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Calculate metrics for the active scope
    const baseCountQuery = {};
    if (req.user.role === 'EVENT_ADMIN') {
      baseCountQuery.eventId = req.user.assignedEventId || '__no-event__';
    } else if (eventId && eventId !== 'ALL') {
      baseCountQuery.eventId = String(eventId).trim().toLowerCase();
    }

    const [totalCount, unreadCount, sponsorCount, stallCount, newCount, commissionAgg, settings] = await Promise.all([
      Inquiry.countDocuments(baseCountQuery),
      Inquiry.countDocuments({ ...baseCountQuery, isRead: false }),
      Inquiry.countDocuments({ ...baseCountQuery, type: 'SPONSOR' }),
      Inquiry.countDocuments({ ...baseCountQuery, type: 'STALL' }),
      Inquiry.countDocuments({ ...baseCountQuery, status: 'NEW' }),
      Inquiry.aggregate([
        { $match: { ...baseCountQuery, commissionStatus: { $in: ['DUE', 'PAID'] } } },
        { $group: { _id: '$commissionStatus', paise: { $sum: '$commissionPaise' }, deals: { $sum: 1 }, dealPaise: { $sum: '$dealAmountPaise' } } }
      ]),
      AdminSettings.getSettings()
    ]);
    const byStatus = Object.fromEntries(commissionAgg.map(r => [r._id, r]));

    return successResponse(res, {
      inquiries,
      stats: {
        total: totalCount,
        unread: unreadCount,
        sponsors: sponsorCount,
        stalls: stallCount,
        new: newCount
      },
      commission: {
        ratePct: settings.partnerCommissionPct ?? DEFAULT_ADMIN_SETTINGS.partnerCommissionPct,
        duePaise: byStatus.DUE?.paise || 0,
        paidPaise: byStatus.PAID?.paise || 0,
        closedDeals: (byStatus.DUE?.deals || 0) + (byStatus.PAID?.deals || 0),
        dealValuePaise: (byStatus.DUE?.dealPaise || 0) + (byStatus.PAID?.dealPaise || 0)
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'INQUIRY_FETCH_FAILED', 500);
  }
};

/**
 * Admin: Update Inquiry Status or Internal Notes
 * PATCH /api/v1/inquiries/:id/status
 */
export const updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, dealAmountRupees } = req.body;

    const inquiry = await Inquiry.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { inquiryId: id }]
    });

    if (!inquiry) {
      return errorResponse(res, 'Inquiry not found', 'NOT_FOUND', 404);
    }

    // Role check: Event Admin can only modify inquiries of their assigned event
    if (req.user.role === 'EVENT_ADMIN' && inquiry.eventId !== req.user.assignedEventId) {
      return errorResponse(res, 'Unauthorized to modify inquiries for this event', 'FORBIDDEN', 403);
    }

    if (status) {
      const nextStatus = status.toUpperCase();
      const isSuperAdmin = req.user.role === ROLES.SUPER_ADMIN;

      if (COMMISSIONABLE_TYPES.includes(inquiry.type)) {
        const touchesDeal = nextStatus !== inquiry.status || dealAmountRupees !== undefined;

        if (touchesDeal && inquiry.commissionStatus === 'PAID') {
          return errorResponse(res, 'Commission for this deal is already paid — the deal is locked', 'COMMISSION_LOCKED', 400);
        }
        // Once a commission is owed, only the platform (super admin) can change or undo the deal
        if (touchesDeal && inquiry.commissionStatus === 'DUE' && !isSuperAdmin) {
          return errorResponse(res, 'This deal has a commission due — contact the FlashPass team to change it', 'COMMISSION_LOCKED', 403);
        }

        if (nextStatus === 'ACCEPTED' && touchesDeal) {
          const deal = Number(dealAmountRupees);
          if (!Number.isFinite(deal) || deal <= 0) {
            return errorResponse(res, 'Enter the final deal amount (₹) to accept this deal', 'DEAL_AMOUNT_REQUIRED', 400);
          }
          const settings = await AdminSettings.getSettings();
          const pct = settings.partnerCommissionPct ?? DEFAULT_ADMIN_SETTINGS.partnerCommissionPct;
          inquiry.dealAmountPaise = Math.round(deal * 100);
          inquiry.commissionPct = pct;
          inquiry.commissionPaise = Math.round((inquiry.dealAmountPaise * pct) / 100);
          inquiry.commissionStatus = 'DUE';
        } else if (nextStatus !== 'ACCEPTED') {
          inquiry.dealAmountPaise = undefined;
          inquiry.commissionPct = undefined;
          inquiry.commissionPaise = 0;
          inquiry.commissionStatus = 'NONE';
        }
      }

      inquiry.status = nextStatus;
    }
    if (adminNotes !== undefined) {
      inquiry.adminNotes = adminNotes;
    }

    inquiry.isRead = true;
    inquiry.handledBy = {
      userId: req.user._id,
      username: req.user.username
    };

    await inquiry.save();

    return successResponse(res, {
      inquiry,
      message: `Inquiry status updated to ${inquiry.status}`
    });
  } catch (error) {
    return errorResponse(res, error.message, 'INQUIRY_UPDATE_FAILED', 500);
  }
};

/**
 * Admin: Mark All Inquiries as Read for Event Scope
 * PATCH /api/v1/inquiries/mark-read
 */
export const markInquiriesAsRead = async (req, res) => {
  try {
    const { eventId } = req.body;
    const query = { isRead: false };

    if (req.user.role === 'EVENT_ADMIN') {
      query.eventId = req.user.assignedEventId || '__no-event__';
    } else if (eventId && eventId !== 'ALL') {
      query.eventId = String(eventId).trim().toLowerCase();
    }

    const result = await Inquiry.updateMany(query, { $set: { isRead: true } });

    return successResponse(res, {
      modifiedCount: result.modifiedCount,
      message: 'All inquiries marked as read'
    });
  } catch (error) {
    return errorResponse(res, error.message, 'MARK_READ_FAILED', 500);
  }
};

/**
 * Admin: Delete an Inquiry
 * DELETE /api/v1/inquiries/:id
 */
export const deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;

    const inquiry = await Inquiry.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { inquiryId: id }]
    });

    if (!inquiry) {
      return errorResponse(res, 'Inquiry not found', 'NOT_FOUND', 404);
    }

    if (req.user.role === 'EVENT_ADMIN' && inquiry.eventId !== req.user.assignedEventId) {
      return errorResponse(res, 'Unauthorized to delete inquiry for this event', 'FORBIDDEN', 403);
    }

    // A commission record is the platform's receivable — only the platform can remove it
    if (inquiry.commissionStatus !== 'NONE' && req.user.role !== ROLES.SUPER_ADMIN) {
      return errorResponse(res, 'This deal has a commission record and cannot be deleted', 'COMMISSION_LOCKED', 403);
    }

    await inquiry.deleteOne();

    return successResponse(res, {
      inquiryId: inquiry.inquiryId,
      message: 'Inquiry deleted successfully'
    });
  } catch (error) {
    return errorResponse(res, error.message, 'DELETE_FAILED', 500);
  }
};


/**
 * Super Admin: Mark a closed deal's platform commission as received
 * PATCH /api/v1/inquiries/:id/commission-paid
 */
export const markCommissionPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const inquiry = await Inquiry.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { inquiryId: id }]
    });

    if (!inquiry) {
      return errorResponse(res, 'Inquiry not found', 'NOT_FOUND', 404);
    }
    if (inquiry.commissionStatus !== 'DUE') {
      return errorResponse(res, 'No commission is due on this inquiry', 'NO_COMMISSION_DUE', 400);
    }

    inquiry.commissionStatus = 'PAID';
    inquiry.commissionPaidAt = new Date();
    inquiry.commissionPaidBy = req.user.username;
    await inquiry.save();

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name || req.user.username,
      action: 'COMMISSION_PAID',
      target: inquiry.inquiryId,
      reason: `Partner commission received for ${inquiry.brandName} (${inquiry.eventId})`,
      after: { commissionPaise: inquiry.commissionPaise, dealAmountPaise: inquiry.dealAmountPaise }
    });

    return successResponse(res, { inquiry, message: 'Commission marked as paid' });
  } catch (error) {
    return errorResponse(res, error.message, 'COMMISSION_UPDATE_FAILED', 500);
  }
};

/**
 * Super Admin: Set the platform commission rate on sponsor/stall deals (applies to deals accepted from now on)
 * PATCH /api/v1/inquiries/commission-rate
 */
export const setCommissionRate = async (req, res) => {
  try {
    const pct = Number(req.body.partnerCommissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return errorResponse(res, 'Commission must be between 0 and 100%', 'INVALID_RATE', 400);
    }

    const settings = await AdminSettings.getSettings();
    const before = settings.partnerCommissionPct;
    settings.partnerCommissionPct = pct;
    await settings.save();

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name || req.user.username,
      action: 'UPDATE_COMMISSION_RATE',
      target: 'AdminSettings',
      reason: 'Partner commission rate changed',
      before: { partnerCommissionPct: before },
      after: { partnerCommissionPct: pct }
    });

    return successResponse(res, { partnerCommissionPct: pct, message: `Commission set to ${pct}%` });
  } catch (error) {
    return errorResponse(res, error.message, 'COMMISSION_RATE_FAILED', 500);
  }
};
