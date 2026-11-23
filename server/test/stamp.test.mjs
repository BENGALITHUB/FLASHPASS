// Exercises the hand-stamp gate flow against an in-memory MongoDB.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);

const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Pass } = await imp('src/models/Pass.js');
const { Event } = await imp('src/models/Event.js');
const { ScanLog } = await imp('src/models/ScanLog.js');
const { AdminSettings } = await imp('src/models/AdminSettings.js');
const { scanPass, getGateStats } = await imp('src/controllers/gate.controller.js');
const { getDashboardMetrics } = await imp('src/controllers/admin.controller.js');
const { generateQRToken } = await imp('src/services/qr.service.js');
const { getISTDateString } = await imp('src/utils/date.utils.js');
const { clearConfigCache } = await imp('src/services/configCache.js');

const call = async (fn, req) => {
  let out;
  const res = { status() { return this; }, json(b) { out = b; return this; } };
  await fn({ query: {}, body: {}, user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN', name: 't' }, ...req }, res);
  if (!out.ok) throw new Error(JSON.stringify(out.error));
  return out.data;
};

const today = getISTDateString();
const shift = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const setToday = async (day) => {
  const s = await AdminSettings.getSettings();
  s.eventDays = [1, 2, 3].map(d => ({ day: d, date: shift(d - day), label: `Day ${d}` }));
  s.markModified('eventDays');
  await s.save();
  clearConfigCache(); // settings changed directly in the DB, as an admin save would clear it
};

let n = 0;
const mkPass = async (extra = {}) => {
  const p = await Pass.create({ orderId: `CC-T${++n}`, holderName: `Fan ${n}`, phone: `98000000${String(n).padStart(2, '0')}`, badge: '3-DAY ALL ACCESS', validDays: [1, 2, 3], ...extra });
  return { pass: p, qr: generateQRToken(p._id.toString(), p.qrNonce) };
};
const scan = (qrToken, mode = 'ENTRY', gateId = 'Gate 1') => call(scanPass, { body: { qrToken, mode, gateId } });

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await Event.create({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200, reentryMode: 'WRISTBAND' });
await setToday(1);

const A = await mkPass();
const B = await mkPass();
const C = await mkPass();
await mkPass(); // D never comes (no-show)

console.log('Stamp mode, Day 1');
await t('gate stats report WRISTBAND mode', async () => {
  const s = await call(getGateStats, {});
  assert.equal(s.reentryMode, 'WRISTBAND');
});
await t('first scan is green', async () => {
  const r = await scan(A.qr);
  assert.equal(r.result, 'ENTRY_OK');
});
await t('second scan same day is ALREADY_USED_TODAY with time + gate', async () => {
  const r = await scan(A.qr, 'ENTRY', 'Gate 2');
  assert.equal(r.result, 'ALREADY_USED_TODAY');
  assert.equal(r.firstEntryGate, 'Gate 1');
  assert.ok(r.firstEntryAt);
  assert.equal(r.holderName, 'Fan 1');
});
await t('exit scan is refused as not needed', async () => {
  const r = await scan(B.qr, 'EXIT');
  assert.equal(r.result, 'EXIT_NOT_NEEDED');
});
await t('30 simultaneous scans of one screenshot: exactly one green', async () => {
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => scan(B.qr, 'ENTRY', `Gate ${(i % 4) + 1}`)));
  assert.equal(rs.filter(r => r.result === 'ENTRY_OK').length, 1);
  assert.equal(rs.filter(r => r.result === 'ALREADY_USED_TODAY').length, 29);
});
await t('scan logs carry the event id', async () => {
  assert.equal(await ScanLog.countDocuments({ eventId: { $ne: 'comics-carnival' } }), 0);
});

console.log('Stamp mode, Day 2 (the old bug: pass was blocked as ALREADY INSIDE)');
await setToday(2);
await t('Day 1 visitor gets in again on Day 2', async () => {
  assert.equal((await scan(A.qr)).result, 'ENTRY_OK');
});
await t('new visitor on Day 2', async () => {
  assert.equal((await scan(C.qr)).result, 'ENTRY_OK');
});
await t('Day 2 repeat still blocked', async () => {
  assert.equal((await scan(C.qr)).result, 'ALREADY_USED_TODAY');
});

await t('footfall report: sold 4, unique 3, no-show 1, Day1=2, Day2=2, visits 4', async () => {
  const m = await call(getDashboardMetrics, {});
  const f = m.footfall;
  assert.equal(f.reentryMode, 'WRISTBAND');
  assert.equal(f.ticketsSold, 4);
  assert.equal(f.uniqueFootfall, 3);
  assert.equal(f.noShow, 1);
  assert.deepEqual(f.byDay.map(d => d.count), [2, 2, 0]);
  assert.equal(f.totalVisits, 4);
  assert.equal(f.blockedReuseToday, 1);
  assert.equal(f.blockedReuseTotal, 31); // 1 + 29 on Day 1, 1 on Day 2
  assert.equal(m.attendance.todayFootfall, 2);
  assert.equal(m.settings.reentryMode, 'WRISTBAND');
});

console.log('IN_OUT mode still works as before');
await Event.updateOne({ eventId: 'comics-carnival' }, { reentryMode: 'IN_OUT' });
clearConfigCache();
await t('entry, then entry again is ALREADY_INSIDE, exit, entry ok', async () => {
  const E = await mkPass();
  assert.equal((await scan(E.qr)).result, 'ENTRY_OK');
  assert.equal((await scan(E.qr)).result, 'ALREADY_INSIDE');
  assert.equal((await scan(E.qr, 'EXIT')).result, 'EXIT_OK');
  assert.equal((await scan(E.qr)).result, 'ENTRY_OK');
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
