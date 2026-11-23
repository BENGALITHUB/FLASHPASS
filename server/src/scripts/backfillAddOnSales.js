import mongoose from 'mongoose';
import dns from 'dns';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Event } from '../models/Event.js';
import { Order } from '../models/Order.js';
import { ORDER_STATUS } from '../constants/index.js';

/**
 * One-off: recompute every event add-on's soldCount from PAID orders.
 * Needed once because soldCount was not tracked before; safe to re-run (it overwrites, never adds).
 * Usage (from server/): node src/scripts/backfillAddOnSales.js
 */

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const events = await Event.find({ 'addOns.0': { $exists: true } });
  for (const event of events) {
    const orders = await Order.find(
      { eventId: event.eventId, status: ORDER_STATUS.PAID, 'addOns.0': { $exists: true } },
      { addOns: 1 }
    );

    const sold = {};
    orders.forEach(o => (o.addOns || []).forEach(a => {
      sold[a.addOnId] = (sold[a.addOnId] || 0) + (a.quantity || 1);
    }));

    event.addOns.forEach(a => { a.soldCount = sold[a.addOnId] || 0; });
    await event.save();
    console.log(`${event.eventId}: ${event.addOns.map(a => `${a.name}=${a.soldCount}`).join(', ')}`);
  }

  await mongoose.disconnect();
  console.log('Add-on sales backfill complete.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
