// An event saved before reentryMode existed must run in hand-stamp mode everywhere.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Pass } = await imp('src/models/Pass.js');
const { AdminSettings } = await imp('src/models/AdminSettings.js');
const { scanPass, getGateStats } = await imp('src/controllers/gate.controller.js');
const { getDashboardMetrics } = await imp('src/controllers/admin.controller.js');
const { generateQRToken } = await imp('src/services/qr.service.js');

// Like the live DB: old global settings saved with IN_OUT, event doc without the field
await AdminSettings.collection.insertOne({ reentryMode: 'IN_OUT', eventDays: [{ day: 1, date: '2099-01-01', label: 'Day 1' }], gateOpenTime: '00:00', gateCloseTime: '23:59' });
await mongoose.connection.collection('events').insertOne({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200 });

const call = async (fn, body = {}) => {
  let out;
  const res = { status() { return this; }, json(b) { out = b; return this; } };
  await fn({ query: {}, body, user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } }, res);
  return out.data;
};

assert.equal((await call(getGateStats)).reentryMode, 'WRISTBAND');
console.log('  ✔ gate screen gets hand-stamp mode');
const m = await call(getDashboardMetrics);
assert.equal(m.footfall.reentryMode, 'WRISTBAND');
assert.equal(m.settings.reentryMode, 'WRISTBAND');
console.log('  ✔ admin dashboard shows hand-stamp mode');

const p = await Pass.create({ orderId: 'CC-OLD1', holderName: 'Fan', phone: '9800000000', badge: '3-DAY', validDays: [1, 2, 3] });
const qr = generateQRToken(p._id.toString(), p.qrNonce);
assert.equal((await call(scanPass, { qrToken: qr })).result, 'ENTRY_OK');
assert.equal((await call(scanPass, { qrToken: qr })).result, 'ALREADY_USED_TODAY');
assert.equal((await call(scanPass, { qrToken: qr, mode: 'EXIT' })).result, 'EXIT_NOT_NEEDED');
console.log('  ✔ scanning follows hand-stamp rules');

await mongoose.disconnect();
await mongod.stop();
console.log('3 checks passed');
