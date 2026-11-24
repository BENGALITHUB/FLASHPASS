import { Order } from '../models/Order.js';
import { Pass } from '../models/Pass.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { Event } from '../models/Event.js';
import { generateOrderId, calculatePassValidity } from '../utils/date.utils.js';
import { completeOrderAndIssuePass } from '../services/ledger.service.js';
import { reconcileIfDue } from '../services/reconcile.service.js';
import { generateQRToken } from '../services/qr.service.js';
import { emitOrderPaid } from '../services/socket.service.js';
import { generatePayUParams, verifyPayUResponseHash, getPayUConfig, PaymentNotConfiguredError } from '../services/payu.service.js';
import {
  generateGatewaySession,
  verifyRazorpaySignature,
  verifyPhonePeChecksum,
  getGatewayConfig,
  isGatewayAvailable,
  isMockPaymentAllowed
} from '../services/gateway.service.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { ORDER_STATUS, ORDER_CHANNELS, PASS_STATUS } from '../constants/index.js';

/**
 * POST /api/v1/orders
 * Create new online order with dynamic pricing snapshot
 */
/**
 * POST /api/v1/orders/validate-coupon
 * Validate discount code against active event coupons
 */
const MAX_NAME_LENGTH = 60;
// The checkout offers groups of 2 to 8.
const MAX_GROUP_TICKETS = 8;
const checkAttendees = attendees => {
  if (!Array.isArray(attendees) || attendees.length < 1 || attendees.length > MAX_GROUP_TICKETS) {
    return { code: 'INVALID_QUANTITY', message: `A group booking can have up to ${MAX_GROUP_TICKETS} tickets` };
  }
  for (let i = 0; i < attendees.length; i++) {
    const a = attendees[i];
    const name = typeof a?.name === 'string' ? a.name.trim() : '';
    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      return { code: 'INVALID_NAME', message: `Enter a name of 2 to ${MAX_NAME_LENGTH} characters for attendee #${i + 1}` };
    }
    if (!/^[6-9]\d{9}$/.test(String(a.phone ?? '').replace(/\D/g, '').slice(-10))) {
      return { code: 'INVALID_PHONE', message: `Enter a valid 10-digit mobile number for attendee #${i + 1}` };
    }
  }
  return null;
};

export const validateCoupon = async (req, res) => {
  try {
    const { code, eventId } = req.body;
    const amountPaise = Number(req.body.amountPaise || req.body.subtotalPaise || req.body.orderAmountPaise || 0);
    if (!code || typeof code !== 'string') {
      return errorResponse(res, 'Coupon code is required', 'MISSING_CODE', 400);
    }

    const event = eventId ? await Event.findOne({ eventId: String(eventId).trim().toLowerCase() }) : null;
    if (!event) {
      return errorResponse(res, 'Event not found', 'NOT_FOUND', 404);
    }

    const coupon = event.coupons?.find(c => c.code === code.trim().toUpperCase() && c.active);
    if (!coupon) {
      return errorResponse(res, 'Invalid or expired promo code', 'INVALID_COUPON', 404);
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return errorResponse(res, 'Coupon usage limit has been reached', 'COUPON_EXHAUSTED', 400);
    }

    if (coupon.expiryDate && new Date() > new Date(coupon.expiryDate)) {
      return errorResponse(res, 'This coupon has expired', 'COUPON_EXPIRED', 400);
    }

    if (coupon.minOrderAmountPaise && amountPaise < coupon.minOrderAmountPaise) {
      return errorResponse(res, `Minimum order amount of ₹${(coupon.minOrderAmountPaise / 100).toFixed(0)} required for this coupon`, 'MIN_ORDER_UNMET', 400);
    }

    let discountPaise = 0;
    if (coupon.discountType === 'PERCENT') {
      discountPaise = Math.round((amountPaise * coupon.discountValue) / 100);
    } else {
      discountPaise = Math.min(amountPaise, coupon.discountValue);
    }

    return successResponse(res, {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountPaise,
      discountRupees: (discountPaise / 100).toFixed(2),
      minOrderAmountPaise: coupon.minOrderAmountPaise || 0,
      message: `Coupon ${coupon.code} applied! Saved ₹${(discountPaise / 100).toFixed(2)}`
    });
  } catch (error) {
    return errorResponse(res, error.message, 'COUPON_ERROR', 500);
  }
};

/**
 * POST /api/v1/orders
 * Create new online order with dynamic pricing, tier selection, group booking, add-ons & promo codes
 */
export const createOrder = async (req, res) => {
  try {
    const {
      name, phone, email, eventId,
      tierId = 'general',
      isGroupBooking = false,
      attendees = [],
      couponCode = null,
      selectedAddOns = [],
      affiliateCode = null
    } = req.body;

    if (typeof name !== 'string' || name.trim().length < 2) {
      return errorResponse(res, 'Please enter a valid full name', 'INVALID_NAME', 400);
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return errorResponse(res, 'Enter a valid 10-digit mobile number', 'INVALID_PHONE', 400);
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      return errorResponse(res, `Name must be ${MAX_NAME_LENGTH} characters or fewer`, 'INVALID_NAME', 400);
    }
    // Every guest's name and mobile go on their own pass, so check them here as well as in the form.
    if (isGroupBooking) {
      const attendeeError = checkAttendees(attendees);
      if (attendeeError) return errorResponse(res, attendeeError.message, attendeeError.code, 400);
    }

    // Every order is for a named event that exists; there is no default event to fall back on.
    const targetEventId = eventId ? String(eventId).trim().toLowerCase() : '';
    const event = targetEventId ? await Event.findOne({ eventId: targetEventId }) : null;
    if (!event) {
      return errorResponse(res, 'This event is not on sale. Pick an event from the home page.', 'EVENT_NOT_FOUND', 400);
    }
    const settings = await AdminSettings.getSettings();

    // Check sales open
    const eventDays = (event && event.eventDays && event.eventDays.length > 0) ? event.eventDays : settings.eventDays;
    const validity = calculatePassValidity(eventDays, settings.salesCutoffDay3);
    if (!validity.salesOpen) {
      return errorResponse(res, validity.reason || 'Ticket sales are closed', 'SALES_CLOSED', 400);
    }

    // Online sales switched off by the admin, or no working way to take the money
    const onlineSalesOn = event ? event.onlineSalesEnabled !== false : settings.onlineSalesEnabled !== false;
    if (!onlineSalesOn || event?.status === 'ARCHIVED' || event?.emergencyLockdown || event?.paymentGateway?.enabled === false) {
      return errorResponse(res, 'Online ticket sales are closed right now. Passes are available at the venue Cash Desk.', 'ONLINE_SALES_CLOSED', 400);
    }
    const gatewayProvider = (event?.paymentGateway?.provider || 'PAYU').toUpperCase();
    if (!isMockPaymentAllowed()) {
      const gatewayReady = isGatewayAvailable(gatewayProvider)
        && (gatewayProvider !== 'PAYU' || getPayUConfig(event).configured);
      if (!gatewayReady) {
        console.error(`[PAYMENT] Online order refused for ${targetEventId}: ${gatewayProvider} is not available or not configured`);
        const notReady = new PaymentNotConfiguredError();
        return errorResponse(res, notReady.message, notReady.code, 503);
      }
    }

    // Check one pass per phone rule (if single booking and enabled)
    if (!isGroupBooking && settings.onePassPerPhone) {
      const existingPass = await Pass.findOne({
        phone: cleanPhone,
        eventId: targetEventId,
        status: PASS_STATUS.ACTIVE
      });
      if (existingPass) {
        return successResponse(res, {
          existingPass: true,
          orderId: existingPass.orderId,
          message: 'This mobile number already has an active pass for this event'
        }, 200);
      }
    }

    // Determine Ticket Tier. Once the admin has ticket types on sale, only those can be bought;
    // with none set up, everyone gets the General pass at the event price.
    const activeTiers = (event?.ticketTiers || []).filter(t => t.active);
    if (activeTiers.length > 0 && !activeTiers.some(t => t.tierId === tierId)) {
      return errorResponse(res, 'This ticket type is no longer on sale. Please pick another one.', 'TIER_NOT_ON_SALE', 400);
    }
    const matchedTier = activeTiers.find(t => t.tierId === tierId) || {
      tierId: 'general',
      name: 'General Comic Pass',
      pricePaise: event ? event.basePricePaise : settings.basePricePaise,
      platformFeePaise: event ? event.platformFeePaise : settings.platformFeePaise,
      badge: 'GENERAL'
    };

    // Calculate passes count
    const passesCount = (isGroupBooking && Array.isArray(attendees) && attendees.length > 0)
      ? attendees.length
      : 1;

    // Check capacity: the whole event's limit, and this ticket type's own limit if it has one
    const eventCapacity = event ? event.capacityLimit : settings.capacityLimit;
    if (eventCapacity > 0) {
      const totalIssued = await Pass.countDocuments({ eventId: targetEventId, status: PASS_STATUS.ACTIVE });
      if (totalIssued + passesCount > eventCapacity) {
        return errorResponse(res, 'Not enough passes left for this event', 'SOLD_OUT', 400);
      }
    }
    if (matchedTier.capacity > 0) {
      const tierIssued = await Pass.countDocuments({ eventId: targetEventId, tierId: matchedTier.tierId, status: PASS_STATUS.ACTIVE });
      if (tierIssued + passesCount > matchedTier.capacity) {
        return errorResponse(res, `Not enough ${matchedTier.name} passes left`, 'SOLD_OUT', 400);
      }
    }

    // Subtotal from Tier
    const subtotalPaise = matchedTier.pricePaise * passesCount;
    const platformFeePaise = (matchedTier.platformFeePaise ?? 200) * passesCount;

    // Add-ons calculation
    let addOnsPaise = 0;
    const processedAddOns = [];
    const soldOutAddOns = [];
    if (Array.isArray(selectedAddOns) && event?.addOns) {
      selectedAddOns.forEach(item => {
        const itemId = item.addOnId || item.addonId;
        const matchedAddOn = event.addOns.find(a => a.addOnId === itemId && a.active);
        if (matchedAddOn && item.quantity > 0) {
          const qty = Number(item.quantity);
          const stockLeft = (matchedAddOn.inventory ?? Infinity) - (matchedAddOn.soldCount || 0);
          if (qty > stockLeft) {
            soldOutAddOns.push(matchedAddOn.name);
            return;
          }
          const itemTotal = matchedAddOn.pricePaise * qty;
          addOnsPaise += itemTotal;
          processedAddOns.push({
            addOnId: matchedAddOn.addOnId,
            name: matchedAddOn.name,
            pricePaise: matchedAddOn.pricePaise,
            quantity: qty,
            variant: item.variant || undefined,
            category: matchedAddOn.category,
            claimed: false
          });
        }
      });
    }
    if (soldOutAddOns.length > 0) {
      return errorResponse(res, `Sold out: ${soldOutAddOns.join(', ')}. Please remove it to continue.`, 'ADDON_SOLD_OUT', 400);
    }

    // Coupon discount calculation
    let discountPaise = 0;
    let appliedCouponCode = null;
    if (couponCode && event?.coupons) {
      const matchedCoupon = event.coupons.find(c => c.code === couponCode.trim().toUpperCase() && c.active);
      if (matchedCoupon) {
        const eligibleBase = subtotalPaise;
        if (!matchedCoupon.minOrderAmountPaise || eligibleBase >= matchedCoupon.minOrderAmountPaise) {
          if (matchedCoupon.discountType === 'PERCENT') {
            discountPaise = Math.round((eligibleBase * matchedCoupon.discountValue) / 100);
          } else {
            discountPaise = Math.min(eligibleBase, matchedCoupon.discountValue);
          }
          appliedCouponCode = matchedCoupon.code;
        }
      }
    }

    // Total final charge
    const organizerSharePaise = Math.max(0, subtotalPaise + addOnsPaise - discountPaise);
    const totalAmountPaise = organizerSharePaise + platformFeePaise;

    // Influencer commission calculation
    let affiliateCommissionPaise = 0;
    let appliedAffiliateCode = null;
    if (affiliateCode && event?.affiliates) {
      const matchedAffiliate = event.affiliates.find(a => a.code === affiliateCode.trim().toLowerCase() && a.active);
      if (matchedAffiliate) {
        appliedAffiliateCode = matchedAffiliate.code;
        affiliateCommissionPaise = Math.round((organizerSharePaise * matchedAffiliate.commissionPct) / 100);
      }
    }

    // Process attendees list for Group Booking
    let finalizedAttendees = [];
    if (isGroupBooking && Array.isArray(attendees) && attendees.length > 0) {
      finalizedAttendees = attendees.map(a => ({
        name: a.name.trim(),
        phone: String(a.phone).replace(/\D/g, '').slice(-10),
        tierId: matchedTier.tierId,
        badge: matchedTier.badge
      }));
    } else {
      finalizedAttendees = [{
        name: name.trim(),
        phone: cleanPhone,
        tierId: matchedTier.tierId,
        badge: matchedTier.badge
      }];
    }

    const orderId = generateOrderId();

    const newOrder = await Order.create({
      orderId,
      eventId: targetEventId,
      channel: ORDER_CHANNELS.ONLINE,
      holderName: name.trim(),
      phone: cleanPhone,
      email: email ? email.trim() : '',
      tierId: matchedTier.tierId,
      tierName: matchedTier.name,
      isGroupBooking: Boolean(isGroupBooking && passesCount > 1),
      attendees: finalizedAttendees,
      couponCode: appliedCouponCode,
      discountPaise,
      subtotalPaise,
      addOns: processedAddOns,
      affiliateCode: appliedAffiliateCode,
      affiliateCommissionPaise,
      amountPaise: totalAmountPaise,
      organizerSharePaise,
      platformFeePaise,
      status: ORDER_STATUS.CREATED,
      gateway: {
        provider: (event?.paymentGateway?.provider || 'PAYU').toUpperCase(),
        method: (event?.paymentGateway?.provider || 'PAYU').toUpperCase()
      }
    });

    const gatewaySession = generateGatewaySession({
      order: newOrder,
      event,
      req
    });

    return successResponse(res, {
      orderId: newOrder.orderId,
      amountPaise: newOrder.amountPaise,
      amountRupees: (newOrder.amountPaise / 100).toFixed(2),
      discountRupees: (discountPaise / 100).toFixed(2),
      tierName: matchedTier.name,
      passesCount,
      holderName: newOrder.holderName,
      phone: newOrder.phone,
      status: newOrder.status,
      gateway: gatewaySession,
      payu: gatewaySession.payu || (gatewaySession.provider === 'PAYU' ? gatewaySession : null)
    }, 201);
  } catch (error) {
    if (error instanceof PaymentNotConfiguredError) {
      return errorResponse(res, error.message, error.code, 503);
    }
    return errorResponse(res, error.message, 'ORDER_CREATION_FAILED', 500);
  }
};

/**
 * GET /api/v1/orders/:orderId/status
 * Poll order status and return pass(es), add-on vouchers & live announcements
 */
export const getOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    let order = await Order.findOne({ orderId });

    if (!order) {
      return errorResponse(res, 'Order not found', 'NOT_FOUND', 404);
    }

    // The buyer is waiting on the payment page: if PayU's redirect never reached us,
    // ask PayU directly (throttled to once every 20s per order)
    if (order.status === ORDER_STATUS.CREATED) {
      const outcome = await reconcileIfDue(order).catch(() => 'WAITING');
      if (outcome === 'PAID') order = await Order.findOne({ orderId });
    }

    const event = await Event.findOne({ eventId: order.eventId || 'comics-carnival' });

    let passData = null;
    let groupPasses = [];

    if (order.status === ORDER_STATUS.PAID) {
      const allPasses = await Pass.find({
        $or: [{ orderId }, { orderId: new RegExp(`^${orderId}`) }]
      }).sort({ groupIndex: 1 });

      if (allPasses.length > 0) {
        groupPasses = allPasses.map(p => ({
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

        passData = groupPasses[0];
      }
    }

    let payuData = null;
    let gatewaySession = null;
    if (order.status === ORDER_STATUS.CREATED) {
      gatewaySession = generateGatewaySession({ order, event, req });
      payuData = gatewaySession.payu || (gatewaySession.provider === 'PAYU' ? gatewaySession : null);
    }

    return successResponse(res, {
      orderId: order.orderId,
      status: order.status,
      amountPaise: order.amountPaise,
      amountRupees: (order.amountPaise / 100).toFixed(2),
      holderName: order.holderName,
      phone: order.phone,
      email: order.email,
      paidAt: order.paidAt,
      tierName: order.tierName,
      isGroupBooking: order.isGroupBooking,
      addOns: order.addOns || [],
      couponCode: order.couponCode,
      discountPaise: order.discountPaise,
      pass: passData,
      passes: groupPasses,
      gateway: gatewaySession,
      payu: payuData,
      subtotalPaise: order.subtotalPaise || (order.amountPaise - (order.platformFeePaise || 200)),
      organizerSharePaise: order.organizerSharePaise,
      platformFeePaise: order.platformFeePaise || 200,
      attendees: order.attendees || [],
      event: event ? {
        eventId: event.eventId,
        name: event.name,
        venue: event.venue,
        eventDays: event.eventDays
      } : null,
      liveAnnouncements: event?.liveAnnouncements?.filter(a => a.active) || [],
      emergencyEvacuation: event?.emergencyEvacuation || { active: false }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'ORDER_STATUS_ERROR', 500);
  }
};

/**
 * POST /api/v1/orders/:orderId/mock-pay
 * Instant test/development payment confirmation
 */
export const mockPayOrder = async (req, res) => {
  if (!isMockPaymentAllowed()) {
    return errorResponse(res, 'Not found', 'NOT_FOUND', 404);
  }
  try {
    const { orderId } = req.params;
    const mockPaymentId = `pay_mock_${Date.now()}`;

    const { order, pass, qrToken } = await completeOrderAndIssuePass({
      orderId,
      paymentId: mockPaymentId
    });

    const passData = {
      passId: pass._id,
      holderName: pass.holderName,
      phone: pass.phone,
      maskedPhone: pass.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
      badge: pass.badge,
      validDays: pass.validDays,
      status: pass.status,
      presence: pass.presence,
      qrToken,
      orderId: pass.orderId
    };

    // Emit live WebSocket update to client
    emitOrderPaid(orderId, passData);

    return successResponse(res, {
      message: 'Payment simulated successfully',
      order,
      pass: passData
    });
  } catch (error) {
    return errorResponse(res, error.message, 'PAYMENT_FAILED', 500);
  }
};

/**
 * POST /api/v1/orders/:orderId/verify-gateway
 * Verify and settle payments from Razorpay, Cashfree, PhonePe, or Stripe
 */
export const verifyGatewayPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      provider,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paymentId: customPaymentId
    } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return errorResponse(res, 'Order not found', 'NOT_FOUND', 404);
    }

    if (order.status === ORDER_STATUS.PAID) {
      const existingPass = await Pass.findOne({ orderId });
      return successResponse(res, {
        orderId,
        status: 'PAID',
        message: 'Order is already settled and pass is active',
        pass: existingPass
      });
    }

    const event = await Event.findOne({ eventId: order.eventId || 'comics-carnival' });
    const targetProvider = (provider || event?.paymentGateway?.provider || 'RAZORPAY').toUpperCase();

    // An order becomes PAID here only with proof from the gateway.
    // Razorpay is the only provider whose proof (a signature) is checked on this
    // route; PayU settles through its own hash-verified callback. Anything else
    // (no signature, placeholder keys, PhonePe/Cashfree/Stripe, which have no
    // server-side verification yet) is a simulated payment and is refused unless
    // mock payments are switched on for local development.
    const config = getGatewayConfig(event);
    const hasRealRazorpayKey = Boolean(
      config.keySecret && !config.keySecret.includes('mock') && !config.keySecret.includes('secret_comicscarnival')
    );
    // Razorpay stays off until orders are created on Razorpay's side: the
    // signature only binds a Razorpay order id the browser sends, not our order
    // or its amount.
    const verifiedByGateway = targetProvider === 'RAZORPAY' && isGatewayAvailable('RAZORPAY')
      && hasRealRazorpayKey && Boolean(razorpay_signature);

    if (verifiedByGateway) {
      const { valid } = verifyRazorpaySignature({
        orderId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        event
      });
      if (!valid) {
        return errorResponse(res, 'Razorpay signature verification failed', 'INVALID_SIGNATURE', 400);
      }
    } else if (!isMockPaymentAllowed()) {
      console.warn(`[GATEWAY VERIFY] Refused unverified ${targetProvider} confirmation for ${orderId}`);
      return errorResponse(res, 'Payment could not be verified. If money was deducted, it will be confirmed automatically or refunded.', 'PAYMENT_NOT_VERIFIED', 400);
    }

    const settledPaymentId = razorpay_payment_id || customPaymentId || `${targetProvider.toLowerCase()}_${Date.now()}`;

    const { pass, passes, qrToken } = await completeOrderAndIssuePass({
      orderId,
      paymentId: settledPaymentId
    });

    await Order.updateOne(
      { orderId },
      {
        $set: {
          'gateway.provider': targetProvider,
          'gateway.gatewayOrderId': razorpay_order_id || orderId,
          'gateway.paymentId': settledPaymentId,
          'gateway.method': targetProvider
        }
      }
    );

    if (pass) {
      const passData = {
        passId: pass._id,
        orderId: pass.orderId,
        holderName: pass.holderName,
        phone: pass.phone,
        maskedPhone: pass.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
        badge: pass.badge,
        validDays: pass.validDays,
        status: pass.status,
        presence: pass.presence,
        qrToken
      };
      emitOrderPaid(orderId, passData);
    }

    return successResponse(res, {
      success: true,
      orderId,
      status: 'PAID',
      message: `Payment successfully verified via ${targetProvider}`,
      pass
    });
  } catch (error) {
    console.error('[GATEWAY VERIFY] Error:', error);
    return errorResponse(res, error.message, 'VERIFICATION_FAILED', 500);
  }
};

/**
 * GET /api/v1/orders/:orderId/payu-params
 * Fetch dynamic PayU form parameters for an existing order
 */
export const getOrderPayUParams = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return errorResponse(res, 'Order not found', 'NOT_FOUND', 404);
    }

    if (order.status === ORDER_STATUS.PAID) {
      return errorResponse(res, 'Order is already paid', 'ALREADY_PAID', 400);
    }

    const event = await Event.findOne({ eventId: order.eventId || 'comics-carnival' });

    const payuData = generatePayUParams({
      orderId: order.orderId,
      amountPaise: order.amountPaise,
      productInfo: `${order.tierName || 'Comic Pass'}`,
      firstName: order.holderName,
      email: order.email,
      phone: order.phone,
      udf1: order.eventId,
      udf2: order.tierId,
      event
    });

    return successResponse(res, payuData);
  } catch (error) {
    if (error instanceof PaymentNotConfiguredError) {
      return errorResponse(res, error.message, error.code, 503);
    }
    return errorResponse(res, error.message, 'PAYU_PARAMS_ERROR', 500);
  }
};

/**
 * POST/GET /api/v1/orders/payu/callback
 * PayU Webhook / Hosted Redirect Callback handler
 */
export const handlePayUCallback = async (req, res) => {
  const data = Object.keys(req.body || {}).length > 0 ? req.body : req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const txnid = data.txnid;
  const status = (data.status || '').toLowerCase();
  const mihpayid = data.mihpayid;
  const errorMsg = data.error_Message || data.unmappedstatus || 'Payment could not be completed';

  console.log(`[PAYU CALLBACK] Received for txnid: ${txnid}, status: ${status}, mihpayid: ${mihpayid}`);

  if (!txnid) {
    return res.redirect(`${clientUrl}/?error=invalid_payu_callback`);
  }

  try {
    // 1. Fetch Order and Event to use the exact Merchant Salt configured for this event
    const existingOrder = await Order.findOne({ orderId: txnid });
    if (!existingOrder) {
      console.error(`[PAYU] Callback for unknown order ${txnid}`);
      return res.redirect(`${clientUrl}/?error=invalid_payu_callback`);
    }
    const event = await Event.findOne({ eventId: existingOrder.eventId || 'comics-carnival' });

    // 2. Verify Hash
    const { isValid, receivedHash } = verifyPayUResponseHash(data, event);

    if (!isValid) {
      console.error(`[PAYU] Hash verification failed for order ${txnid}. Received: ${receivedHash}`);
      return res.redirect(`${clientUrl}/order/${txnid}?payu=tampered&msg=${encodeURIComponent('Security signature verification failed')}`);
    }

    // 3. Check Payment Status
    if (status === 'success') {
      // The signed amount must be what this order costs
      const paidPaise = Math.round(Number.parseFloat(data.amount) * 100);
      if (!Number.isFinite(paidPaise) || paidPaise !== existingOrder.amountPaise) {
        console.error(`[PAYU] Amount mismatch for order ${txnid}: paid ${data.amount}, order is ${existingOrder.amountPaise} paise`);
        return res.redirect(`${clientUrl}/order/${txnid}?payu=error&msg=${encodeURIComponent('Payment amount did not match. Please contact the Help Desk with your Order ID.')}`);
      }

      const { order, pass, passes, qrToken } = await completeOrderAndIssuePass({
        orderId: txnid,
        paymentId: mihpayid || `payu_${Date.now()}`
      });

      // Update Order Gateway info
      await Order.updateOne(
        { orderId: txnid },
        {
          $set: {
            'gateway.provider': 'PAYU',
            'gateway.gatewayOrderId': txnid,
            'gateway.paymentId': mihpayid || `payu_${Date.now()}`,
            'gateway.method': data.mode || data.bankcode || 'PAYU'
          }
        }
      );

      // Emit Live WebSocket update
      if (pass) {
        const passData = {
          passId: pass._id,
          orderId: pass.orderId,
          holderName: pass.holderName,
          phone: pass.phone,
          maskedPhone: pass.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
          badge: pass.badge,
          validDays: pass.validDays,
          status: pass.status,
          presence: pass.presence,
          qrToken
        };
        emitOrderPaid(txnid, passData);
      }

      console.log(`[PAYU] Order ${txnid} marked PAID successfully with pass created.`);
      return res.redirect(`${clientUrl}/pass/${txnid}?payment=success`);
    } else {
      // Payment failed or cancelled by user
      console.warn(`[PAYU] Payment cancelled/failed for order ${txnid}: ${errorMsg}`);
      await Order.updateOne(
        { orderId: txnid, status: ORDER_STATUS.CREATED },
        {
          $set: {
            'gateway.provider': 'PAYU',
            'gateway.gatewayOrderId': txnid,
            'gateway.paymentId': mihpayid || null,
            'gateway.method': data.mode || 'PAYU'
          }
        }
      );

      return res.redirect(`${clientUrl}/order/${txnid}?payu=failed&msg=${encodeURIComponent(errorMsg)}`);
    }
  } catch (error) {
    console.error(`[PAYU] Callback processing error for order ${txnid}:`, error);
    return res.redirect(`${clientUrl}/order/${txnid}?payu=error&msg=${encodeURIComponent(error.message)}`);
  }
};

