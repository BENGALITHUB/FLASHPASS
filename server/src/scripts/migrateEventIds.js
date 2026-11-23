import mongoose from 'mongoose';
import dns from 'dns';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const uri = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const resOrders = await db.collection('orders').updateMany(
    { $or: [{ eventId: { $exists: false } }, { eventId: null }] },
    { $set: { eventId: 'comics-carnival' } }
  );

  const resPasses = await db.collection('passes').updateMany(
    { $or: [{ eventId: { $exists: false } }, { eventId: null }] },
    { $set: { eventId: 'comics-carnival' } }
  );

  const resLedger = await db.collection('ledgerentries').updateMany(
    { $or: [{ eventId: { $exists: false } }, { eventId: null }] },
    { $set: { eventId: 'comics-carnival' } }
  );

  const resScans = await db.collection('scanlogs').updateMany(
    { $or: [{ eventId: { $exists: false } }, { eventId: null }] },
    { $set: { eventId: 'comics-carnival' } }
  );

  console.log(`Updated orders: ${resOrders.modifiedCount}, passes: ${resPasses.modifiedCount}, ledger: ${resLedger.modifiedCount}, scans: ${resScans.modifiedCount}`);
  await mongoose.disconnect();
}

run().catch(console.error);
