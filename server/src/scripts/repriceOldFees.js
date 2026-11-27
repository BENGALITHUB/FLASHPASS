import mongoose from 'mongoose';
import dns from 'dns';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Event } from '../models/Event.js';
import { Order } from '../models/Order.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Payout } from '../models/Payout.js';
import { AuditLog } from '../models/AuditLog.js';
import { LEDGER_TYPES } from '../constants/index.js';

/**
 * One-off: charge an event's already-sold passes at the event's CURRENT platform fee.
 * The buyer's total (gross) stays the same; the difference moves from the
 * organizer's share to the platform fee, on both the order and its ledger rows.
 *
 * Example: 44 passes sold at ₹1 fee, fee now ₹2 → platform fee ₹44 → ₹88,
 * organizer share goes down by ₹44.
 *
 * Usage (from server/):
 *   node src/scripts/repriceOldFees.js <eventId>           # preview only, changes nothing
 *   node src/scripts/repriceOldFees.js <eventId> --apply   # save the changes
 * Safe to re-run: orders already at the current fee are skipped.
 */

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const rs = (p) => `₹${(p / 100).toFixed(2)}`;

async function run() {
  const eventId = String(process.argv[2] || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');
  if (!eventId || eventId.startsWith('--')) {
    console.error('Usage: node src/scripts/repriceOldFees.js <eventId> [--apply]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const event = await Event.findOne({ eventId }).lean();
  if (!event) throw new Error(`No event with id "${eventId}"`);
  const targetFee = event.platformFeePaise;
  if (!Number.isInteger(targetFee) || targetFee <= 0) throw new Error(`Event fee looks wrong: ${targetFee}`);

  // Only orders that reached the ledger (actually sold) matter for the money.
  const soldIds = await LedgerEntry.distinct('orderId', { eventId, type: LEDGER_TYPES.SALE });
  const orders = await Order.find({ orderId: { $in: soldIds } });

  const changes = [];
  for (const o of orders) {
    const passes = o.isGroupBooking && o.attendees?.length ? o.attendees.length : 1;
    const newFee = targetFee * passes;
    const delta = newFee - (o.platformFeePaise || 0);
    if (delta <= 0) continue; // already at (or above) the current fee
    if ((o.organizerSharePaise || 0) - delta < 0) {
      console.warn(`Skip ${o.orderId}: organizer share ${rs(o.organizerSharePaise)} is smaller than the extra fee ${rs(delta)}`);
      continue;
    }
    changes.push({ order: o, passes, oldFee: o.platformFeePaise || 0, newFee, delta });
  }

  const totalDelta = changes.reduce((s, c) => s + c.delta, 0);
  const [ledgerNow] = await LedgerEntry.aggregate([
    { $match: { eventId } },
    { $group: { _id: null, gross: { $sum: '$grossPaise' }, org: { $sum: '$organizerPaise' }, fee: { $sum: '$platformPaise' } } }
  ]);
  const [paid] = await Payout.aggregate([
    { $match: { eventId, voided: false } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } }
  ]);
  const paidOut = paid?.total || 0;
  const now = ledgerNow || { gross: 0, org: 0, fee: 0 };

  console.log(`Event: ${event.name} (${eventId}), current fee ${rs(targetFee)} per pass`);
  console.log(`Orders to change: ${changes.length} (${changes.reduce((s, c) => s + c.passes, 0)} passes)`);
  console.log(`              Before        After`);
  console.log(`Gross         ${rs(now.gross).padEnd(13)} ${rs(now.gross)}`);
  console.log(`Platform fee  ${rs(now.fee).padEnd(13)} ${rs(now.fee + totalDelta)}`);
  console.log(`Organizer     ${rs(now.org).padEnd(13)} ${rs(now.org - totalDelta)}`);
  console.log(`Paid out      ${rs(paidOut)}`);
  console.log(`Balance due   ${rs(now.org - paidOut).padEnd(13)} ${rs(now.org - totalDelta - paidOut)}`);

  if (now.org - totalDelta - paidOut < 0) {
    throw new Error('The organizer has already been paid more than the new share. Nothing changed.');
  }
  if (!apply) {
    console.log('\nPreview only. Run again with --apply to save.');
    return;
  }
  if (changes.length === 0) return;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const c of changes) {
        c.order.platformFeePaise = c.newFee;
        c.order.organizerSharePaise -= c.delta;
        await c.order.save({ session });
        // A sale moves money one way, a reversal the other.
        await LedgerEntry.updateMany(
          { orderId: c.order.orderId, type: LEDGER_TYPES.SALE },
          { $inc: { platformPaise: c.delta, organizerPaise: -c.delta } },
          { session }
        );
        await LedgerEntry.updateMany(
          { orderId: c.order.orderId, type: LEDGER_TYPES.REVERSAL },
          { $inc: { platformPaise: -c.delta, organizerPaise: c.delta } },
          { session }
        );
      }
      await AuditLog.create([{
        actorName: 'System script',
        action: 'REPRICE_PLATFORM_FEE',
        target: `Event ${eventId}`,
        reason: `Old sales re-charged at current platform fee ${rs(targetFee)} per pass`,
        before: { platformPaise: now.fee, organizerPaise: now.org },
        after: { platformPaise: now.fee + totalDelta, organizerPaise: now.org - totalDelta, orders: changes.map(c => c.order.orderId) }
      }], { session });
    });
    console.log('\nSaved.');
  } finally {
    await session.endSession();
  }
}

run()
  .catch((err) => { console.error(err.message || err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
