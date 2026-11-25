import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Pass } from '../models/Pass.js';
import { Event } from '../models/Event.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { calculatePassValidity } from '../utils/date.utils.js';
import { generateQRToken } from './qr.service.js';
import { ORDER_STATUS, LEDGER_TYPES } from '../constants/index.js';

/**
 * Atomic settlement: Marks order PAID, creates Pass(es), creates LedgerEntry
 * Uses MongoDB replica set transaction (ACID)
 */
export const completeOrderAndIssuePass = async ({ orderId, paymentId = null, cashierId = null, session = null }) => {
  const isExternalSession = !!session;
  const currentSession = isExternalSession ? session : await mongoose.startSession();

  if (!isExternalSession) {
    currentSession.startTransaction();
  }

  try {
    const order = await Order.findOne({ orderId }).session(currentSession);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === ORDER_STATUS.PAID) {
      // Idempotency: Already paid, return existing pass(es)
      const existingPasses = await Pass.find({
        $or: [{ orderId }, { orderId: new RegExp(`^${orderId}`) }]
      }).session(currentSession);

      const mainPass = existingPasses[0] || await Pass.findOne({ orderId }).session(currentSession);
      const qrToken = mainPass ? generateQRToken(mainPass._id.toString(), mainPass.qrNonce) : '';
      if (!isExternalSession) await currentSession.commitTransaction();
      return { order, pass: mainPass, passes: existingPasses, qrToken };
    }

    const settings = await AdminSettings.getSettings();
    const event = await Event.findOne({ eventId: order.eventId || 'comics-carnival' }).session(currentSession);

    const eventDays = (event && event.eventDays && event.eventDays.length > 0) ? event.eventDays : settings.eventDays;
    const validity = calculatePassValidity(eventDays, settings.salesCutoffDay3);

    // 1. Update Order status
    order.status = ORDER_STATUS.PAID;
    order.paidAt = new Date();
    if (paymentId) order.gateway.paymentId = paymentId;
    if (cashierId) order.cashierId = cashierId;
    await order.save({ session: currentSession });

    // 2. Determine Tier & Permissions
    const tier = event?.ticketTiers?.find(t => t.tierId === order.tierId) || {
      tierId: order.tierId || 'general',
      name: order.tierName || 'General Comic Pass',
      badge: validity.badge,
      allowedZones: ['MAIN_HALL', 'EXHIBIT_ZONE']
    };

    const passesToCreate = [];

    // Group Booking vs Single Pass
    if (order.isGroupBooking && Array.isArray(order.attendees) && order.attendees.length > 0) {
      order.attendees.forEach((att, idx) => {
        const passOrderId = idx === 0 ? order.orderId : `${order.orderId}-P${idx + 1}`;
        passesToCreate.push({
          orderId: passOrderId,
          eventId: order.eventId || 'comics-carnival',
          holderName: att.name || order.holderName,
          phone: att.phone || order.phone,
          email: att.email || order.email || '',
          badge: tier.badge || validity.badge,
          tierId: tier.tierId,
          tierName: tier.name,
          allowedZones: tier.allowedZones || ['MAIN_HALL', 'EXHIBIT_ZONE'],
          validDays: validity.validDays,
          addOns: order.addOns || [],
          isGroupPass: true,
          groupIndex: idx + 1
        });
      });
    } else {
      passesToCreate.push({
        orderId: order.orderId,
        eventId: order.eventId || 'comics-carnival',
        holderName: order.holderName,
        phone: order.phone,
        email: order.email || '',
        badge: tier.badge || validity.badge,
        tierId: tier.tierId,
        tierName: tier.name,
        allowedZones: tier.allowedZones || ['MAIN_HALL', 'EXHIBIT_ZONE'],
        validDays: validity.validDays,
        addOns: order.addOns || [],
        isGroupPass: false,
        groupIndex: 1
      });
    }

    const createdPasses = [];
    for (const p of passesToCreate) {
      const [created] = await Pass.create([p], { session: currentSession });
      createdPasses.push(created);
    }
    const mainPass = createdPasses[0];

    // Link created pass IDs back to order attendees
    if (order.isGroupBooking && Array.isArray(order.attendees)) {
      order.attendees.forEach((att, idx) => {
        if (createdPasses[idx]) {
          att.passId = createdPasses[idx]._id;
        }
      });
      await order.save({ session: currentSession });
    }

    // 3. Create Ledger Entry (Append-only)
    const [ledgerEntry] = await LedgerEntry.create([{
      orderId: order.orderId,
      eventId: order.eventId || 'comics-carnival',
      type: LEDGER_TYPES.SALE,
      channel: order.channel,
      grossPaise: order.amountPaise,
      organizerPaise: order.organizerSharePaise,
      platformPaise: order.platformFeePaise,
      byUserId: cashierId,
      at: new Date()
    }], { session: currentSession });

    // 4. Update Event stats (Coupon, Affiliate, Tier sales)
    if (event) {
      // Tier sold count
      const matchedTier = event.ticketTiers?.find(t => t.tierId === order.tierId);
      if (matchedTier) {
        matchedTier.soldCount = (matchedTier.soldCount || 0) + passesToCreate.length;
      }

      // Add-on / merch sold count (drives stock-left on the site and the admin merch panel)
      (order.addOns || []).forEach(item => {
        const matchedAddOn = event.addOns?.find(a => a.addOnId === item.addOnId);
        if (matchedAddOn) {
          matchedAddOn.soldCount = (matchedAddOn.soldCount || 0) + (item.quantity || 1);
        }
      });

      // Coupon usage
      if (order.couponCode) {
        const matchedCoupon = event.coupons?.find(c => c.code === order.couponCode.toUpperCase());
        if (matchedCoupon) {
          matchedCoupon.usedCount = (matchedCoupon.usedCount || 0) + 1;
        }
      }

      // Affiliate / Ambassador tracking
      if (order.affiliateCode) {
        const matchedAffiliate = event.affiliates?.find(a => a.code === order.affiliateCode.toLowerCase());
        if (matchedAffiliate) {
          matchedAffiliate.ordersCount = (matchedAffiliate.ordersCount || 0) + 1;
          matchedAffiliate.totalSalesPaise = (matchedAffiliate.totalSalesPaise || 0) + order.amountPaise;
          matchedAffiliate.totalCommissionPaise = (matchedAffiliate.totalCommissionPaise || 0) + (order.affiliateCommissionPaise || 0);
        }
      }

      await event.save({ session: currentSession });
    }

    if (!isExternalSession) {
      await currentSession.commitTransaction();
    }

    const qrToken = generateQRToken(mainPass._id.toString(), mainPass.qrNonce);

    return {
      order,
      pass: mainPass,
      passes: createdPasses,
      ledgerEntry,
      qrToken
    };
  } catch (error) {
    if (!isExternalSession) {
      await currentSession.abortTransaction();
    }
    throw error;
  } finally {
    if (!isExternalSession) {
      currentSession.endSession();
    }
  }
};

