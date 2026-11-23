/*
 * Delete attendee selfies stored before the selfie feature was removed.
 *
 *   node server/scripts/remove-selfies.mjs          # count only, changes nothing
 *   node server/scripts/remove-selfies.mjs --yes    # delete the photos
 *
 * Uses MONGODB_URI from server/.env. Only the photo fields are removed; passes,
 * orders and everything else stay as they are. This cannot be undone.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import dns from 'dns';
import mongoose from 'mongoose';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch { /* Atlas SRV lookups on some ISPs */ }

const apply = process.argv.includes('--yes');
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const counts = {
  passes: await db.collection('passes').countDocuments({ photoUrl: { $nin: [null, ''] } }),
  orders: await db.collection('orders').countDocuments({ photoUrl: { $nin: [null, ''] } }),
  orderAttendees: await db.collection('orders').countDocuments({ 'attendees.photoUrl': { $nin: [null, ''] } })
};
console.log('Stored selfies found:', counts);

if (!apply) {
  console.log('Nothing changed. Run again with --yes to delete these photos.');
} else {
  const p = await db.collection('passes').updateMany({ photoUrl: { $exists: true } }, { $unset: { photoUrl: '' } });
  const o = await db.collection('orders').updateMany({ photoUrl: { $exists: true } }, { $unset: { photoUrl: '' } });
  const a = await db.collection('orders').updateMany({ 'attendees.photoUrl': { $exists: true } }, { $unset: { 'attendees.$[].photoUrl': '' } });
  console.log(`Deleted photos from ${p.modifiedCount} passes, ${o.modifiedCount} orders, ${a.modifiedCount} group orders.`);
}
await mongoose.disconnect();
