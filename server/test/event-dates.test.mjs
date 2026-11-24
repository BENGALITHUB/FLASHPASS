// Each event runs on its own dates: the admin can set them, and the gate works out
// "today is Day N" from the pass's event, not from the global settings.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Pass } = await imp('src/models/Pass.js');
const { AdminSettings } = await imp('src/models/AdminSettings.js');
const { scanPass } = await imp('src/controllers/gate.controller.js');
const { toEventDays } = await imp('src/controllers/admin.controller.js');
const { generateQRToken } = await imp('src/services/qr.service.js');
const { getISTDateString } = await imp('src/utils/date.utils.js');

// Dates: 1 to 7 real dates, put in order, no repeats.
assert.deepEqual(toEventDays(['2026-12-26', '2026-12-24', '2026-12-25']).value.map(d => [d.day, d.date]), [[1, '2026-12-24'], [2, '2026-12-25'], [3, '2026-12-26']]);
for (const bad of [[], ['2026-02-30'], ['24-12-2026'], ['2026-12-24', '2026-12-24'], Array.from({ length: 8 }, (_, i) => `2026-12-${10 + i}`), 'x']) {
  assert.ok(toEventDays(bad).error, JSON.stringify(bad));
}
console.log('  ✔ event dates are checked and ordered');

// Global settings still on other dates; the event runs yesterday, today, tomorrow.
const day = (offset) => { const d = new Date(`${getISTDateString()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
await AdminSettings.collection.insertOne({ eventDays: [{ day: 1, date: '2099-01-01' }, { day: 2, date: '2099-01-02' }, { day: 3, date: '2099-01-03' }], gateOpenTime: '00:00', gateCloseTime: '23:59' });
await mongoose.connection.collection('events').insertOne({ eventId: 'kck', name: 'KCK', reentryMode: 'IN_OUT', allowReentry: true, maxReentriesPerDay: 2,
  eventDays: [{ day: 1, date: day(-1) }, { day: 2, date: day(0) }, { day: 3, date: day(1) }] });

// Came in yesterday (Day 1) and left; today is Day 2, so this is a first entry, not a reuse.
const p = await Pass.create({ orderId: 'KCK-1', eventId: 'kck', holderName: 'Fan', phone: '9800000000', badge: '3-DAY', validDays: [1, 2, 3], firstEntryDays: [1], presence: 'OUTSIDE' });
let out;
const res = { status() { return this; }, json(b) { out = b; return this; } };
await scanPass({ body: { qrToken: generateQRToken(p._id.toString(), p.qrNonce) }, user: { _id: new mongoose.Types.ObjectId() } }, res);
assert.equal(out.data.result, 'ENTRY_OK', JSON.stringify(out.data));
assert.deepEqual((await Pass.findById(p._id)).firstEntryDays, [1, 2]);
console.log('  ✔ the gate counts days from the pass\'s own event');

// Gate hours are the event's own: closed hours turn the pass away even though global hours are all day.
await mongoose.connection.collection('events').updateOne({ eventId: 'kck' }, { $set: { gateOpenTime: '00:00', gateCloseTime: '00:01' } });
(await imp('src/services/configCache.js')).clearConfigCache();
const p2 = await Pass.create({ orderId: 'KCK-2', eventId: 'kck', holderName: 'Late', phone: '9800000001', badge: '3-DAY', validDays: [1, 2, 3] });
await scanPass({ body: { qrToken: generateQRToken(p2._id.toString(), p2.qrNonce) }, user: { _id: new mongoose.Types.ObjectId() } }, res);
const nowHHMM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
if (nowHHMM > '00:01') assert.equal(out.data.result, 'OUTSIDE_GATE_HOURS', JSON.stringify(out.data));
console.log("  ✔ the gate keeps the event's own hours");

await mongoose.disconnect();
await mongod.stop();
console.log('3 checks passed');
