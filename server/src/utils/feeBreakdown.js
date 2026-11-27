import { Pass } from '../models/Pass.js';
import { Order } from '../models/Order.js';
import { PASS_STATUS } from '../constants/index.js';

const DEFAULT_EVENT = 'comics-carnival';
// Group bookings give extra passes the order ID plus "-P2", "-P3", ...
const baseOrderId = (id) => String(id || '').replace(/-P\d+$/, '');

/**
 * Platform fee per active pass, grouped by the rate charged when it was sold.
 * The fee is stored on each order at sale time, so changing the event's fee later
 * never changes what old passes paid. Example: 44 passes sold at ₹1, then 4 at ₹2
 * → [{ feePaise: 100, passes: 44 }, { feePaise: 200, passes: 4 }].
 */
export async function feeBreakdown(eventId) {
  const eventMatch = eventId === DEFAULT_EVENT ? { $in: [eventId, null] } : eventId;
  const passes = await Pass.find({ eventId: eventMatch, status: PASS_STATUS.ACTIVE }).select('orderId').lean();
  if (passes.length === 0) return [];

  const activeByOrder = new Map();
  for (const p of passes) {
    const id = baseOrderId(p.orderId);
    activeByOrder.set(id, (activeByOrder.get(id) || 0) + 1);
  }

  const orders = await Order.find({ orderId: { $in: [...activeByOrder.keys()] } })
    .select('orderId platformFeePaise isGroupBooking attendees').lean();

  const rates = new Map();
  for (const o of orders) {
    // An order's fee covers every pass it issued; split it to get the per-pass rate.
    const issued = o.isGroupBooking && o.attendees?.length ? o.attendees.length : 1;
    const feePaise = Math.round((o.platformFeePaise || 0) / issued);
    rates.set(feePaise, (rates.get(feePaise) || 0) + activeByOrder.get(o.orderId));
  }
  return [...rates.entries()]
    .map(([feePaise, count]) => ({ feePaise, passes: count }))
    .sort((a, b) => a.feePaise - b.feePaise);
}
