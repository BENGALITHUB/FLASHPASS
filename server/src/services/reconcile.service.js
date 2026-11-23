import { Order } from '../models/Order.js';
import { Event } from '../models/Event.js';
import { verifyPayUTransaction } from './payu.service.js';
import { completeOrderAndIssuePass } from './ledger.service.js';
import { emitOrderPaid } from './socket.service.js';
import { ORDER_STATUS, ORDER_CHANNELS } from '../constants/index.js';

/*
 * Payment reconciliation (SRS FR-M1-07, NFR-AV-02).
 *
 * A PayU order normally becomes PAID when the buyer's browser comes back to
 * our callback. If the buyer closes the browser or loses network after paying,
 * that never happens. This service asks PayU directly about orders still
 * waiting and issues the pass when PayU confirms the payment and the amount.
 */

const RUN_EVERY_MS = 60 * 1000;
const LOOK_BACK_MS = 24 * 60 * 60 * 1000; // give up checking after a day
const MIN_AGE_MS = 60 * 1000;             // let the normal callback arrive first
const BATCH = 50;

// How long to wait between checks of the same order: every minute for the
// first 30 minutes (SRS), then every 10 minutes until the day is up.
const recheckGap = (ageMs) => (ageMs < 30 * 60 * 1000 ? 55 * 1000 : 10 * 60 * 1000);

/**
 * Check one waiting order with PayU and settle it if paid.
 * Returns 'PAID' | 'WAITING' | 'AMOUNT_MISMATCH' | 'SKIPPED'.
 */
export async function reconcileOrder(order) {
  if (!order || order.status !== ORDER_STATUS.CREATED) return 'SKIPPED';
  if ((order.gateway?.provider || '').toUpperCase() !== 'PAYU') return 'SKIPPED';

  const event = await Event.findOne({ eventId: order.eventId || 'comics-carnival' });
  let result;
  try {
    result = await verifyPayUTransaction(order.orderId, event);
  } catch (err) {
    await Order.updateOne({ _id: order._id }, {
      $set: { 'gateway.lastCheckedAt': new Date(), 'gateway.lastCheckStatus': `error: ${err.message}`.slice(0, 120) },
      $inc: { 'gateway.checkCount': 1 }
    });
    return 'WAITING';
  }

  const note = result.found ? result.status : 'not found';
  await Order.updateOne({ _id: order._id }, {
    $set: { 'gateway.lastCheckedAt': new Date(), 'gateway.lastCheckStatus': note },
    $inc: { 'gateway.checkCount': 1 }
  });

  if (!result.found || result.status !== 'success') return 'WAITING';

  // Never issue a pass for less money than the order costs
  if (result.amountPaise !== order.amountPaise) {
    console.error(`[RECONCILE] ${order.orderId}: PayU says paid ₹${(result.amountPaise || 0) / 100} but order is ₹${order.amountPaise / 100}. Not issuing a pass.`);
    await Order.updateOne({ _id: order._id }, { $set: { 'gateway.lastCheckStatus': 'amount mismatch' } });
    return 'AMOUNT_MISMATCH';
  }

  const paymentId = result.mihpayid || `payu_${order.orderId}`;
  const { pass, qrToken } = await completeOrderAndIssuePass({ orderId: order.orderId, paymentId });
  await Order.updateOne({ _id: order._id }, {
    $set: {
      'gateway.provider': 'PAYU',
      'gateway.gatewayOrderId': order.orderId,
      'gateway.paymentId': paymentId,
      'gateway.method': result.mode || 'PAYU',
      'gateway.lastCheckStatus': 'success (reconciled)'
    }
  });

  if (pass) {
    emitOrderPaid(order.orderId, {
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
    });
  }
  console.log(`[RECONCILE] ${order.orderId} confirmed with PayU and marked PAID.`);
  return 'PAID';
}

/**
 * Check, if due, a single order the buyer is looking at (their payment page
 * polls order status). Throttled so polling doesn't hammer PayU.
 */
export async function reconcileIfDue(order, minGapMs = 20 * 1000) {
  if (!order || order.status !== ORDER_STATUS.CREATED) return 'SKIPPED';
  const age = Date.now() - new Date(order.createdAt).getTime();
  if (age < 30 * 1000) return 'SKIPPED';
  const last = order.gateway?.lastCheckedAt ? new Date(order.gateway.lastCheckedAt).getTime() : 0;
  if (Date.now() - last < minGapMs) return 'SKIPPED';
  return reconcileOrder(order);
}

/** One pass over all waiting online PayU orders that are due a check. */
export async function runReconciliation() {
  const now = Date.now();
  const candidates = await Order.find({
    status: ORDER_STATUS.CREATED,
    channel: ORDER_CHANNELS.ONLINE,
    'gateway.provider': 'PAYU',
    createdAt: { $gte: new Date(now - LOOK_BACK_MS), $lte: new Date(now - MIN_AGE_MS) }
  }).sort({ createdAt: -1 }).limit(BATCH * 4);

  const due = candidates.filter(o => {
    const last = o.gateway?.lastCheckedAt ? new Date(o.gateway.lastCheckedAt).getTime() : 0;
    return now - last >= recheckGap(now - new Date(o.createdAt).getTime());
  }).slice(0, BATCH);

  const counts = { PAID: 0, WAITING: 0, AMOUNT_MISMATCH: 0, SKIPPED: 0 };
  for (const order of due) {
    try {
      counts[await reconcileOrder(order)]++;
    } catch (err) {
      console.error(`[RECONCILE] ${order.orderId} failed:`, err.message);
    }
  }
  if (counts.PAID || counts.AMOUNT_MISMATCH) {
    console.log(`[RECONCILE] checked ${due.length}: ${counts.PAID} paid, ${counts.AMOUNT_MISMATCH} amount mismatch`);
  }
  return counts;
}

let timer = null;
let running = false;

export function startReconciliationJob() {
  if (timer || process.env.RECONCILE_DISABLED === 'true') return;
  timer = setInterval(async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      await runReconciliation();
    } catch (err) {
      console.error('[RECONCILE] run failed:', err.message);
    } finally {
      running = false;
    }
  }, RUN_EVERY_MS);
  timer.unref?.();
  console.log('[RECONCILE] PayU payment check running every 60s');
}
