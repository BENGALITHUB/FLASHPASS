// Organizer settlement: balances, payouts, requests, concurrency, voids, statement.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);

const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(rs.getUri());

const { LedgerEntry } = await imp('src/models/LedgerEntry.js');
const { Event } = await imp('src/models/Event.js');
const { Payout } = await imp('src/models/Payout.js');
const { SettlementRequest } = await imp('src/models/SettlementRequest.js');
const S = await imp('src/controllers/settlement.controller.js');
const { getPlatformOverview } = await imp('src/controllers/admin.controller.js');

await Promise.all([Payout.init(), SettlementRequest.init()]); // build unique indexes
for (const c of ['auditlogs', 'payouts', 'settlementrequests', 'users', 'events', 'ledgerentries']) {
  await mongoose.connection.createCollection(c).catch(() => {});
}

const oid = () => new mongoose.Types.ObjectId();
const ADMIN = { _id: oid(), role: 'SUPER_ADMIN', name: 'Platform' };
const ORG = { _id: oid(), role: 'EVENT_ADMIN', name: 'Organizer', assignedEventId: 'comics-carnival' };
const OTHER_ORG = { _id: oid(), role: 'EVENT_ADMIN', name: 'Other', assignedEventId: 'anime-fest' };

const call = async (fn, user, { params = {}, body = {} } = {}) => {
  let out, code = 200, raw;
  const res = {
    status(c) { code = c; return this; }, json(b) { out = b; return this; },
    setHeader() {}, send(s) { raw = s; return this; }
  };
  await fn({ user, params, body, query: {} }, res);
  return { code, out, raw, data: out?.data, err: out?.error };
};

await Event.create({ eventId: 'comics-carnival', name: 'Comics Carnival', venue: 'V', basePricePaise: 5000, platformFeePaise: 200 });
await Event.create({ eventId: 'anime-fest', name: 'Anime Fest', venue: 'V', basePricePaise: 5000, platformFeePaise: 200 });
const sale = (orderId, eventId = 'comics-carnival') => ({ orderId, eventId, type: 'SALE', channel: 'ONLINE', grossPaise: 5200, organizerPaise: 5000, platformPaise: 200 });
await LedgerEntry.create([
  sale('A'), sale('B'), sale('C'),
  { orderId: 'C', eventId: 'comics-carnival', type: 'REVERSAL', channel: 'ONLINE', grossPaise: -5200, organizerPaise: -5000, platformPaise: -200 },
  sale('X', 'anime-fest')
]);
// passesSold counts active passes; the refunded order C left a voided pass
const { Pass } = await imp('src/models/Pass.js');
const pass = (orderId, eventId = 'comics-carnival', status = 'ACTIVE') => ({ orderId, eventId, status, holderName: 'Fan', phone: '9000000000', badge: 'GENERAL' });
await Pass.create([pass('A'), pass('B'), pass('C', 'comics-carnival', 'VOIDED'), pass('X', 'anime-fest')]);

const cc = async () => (await call(S.getSettlement, ADMIN, { params: { eventId: 'comics-carnival' } })).data.summary;
const pay = (body) => call(S.recordPayout, ADMIN, { params: { eventId: 'comics-carnival' }, body });

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await t('owed comes from ledger: 3 sales − 1 refund = ₹100 owed, 2 passes', async () => {
  const s = await cc();
  assert.equal(s.owedPaise, 10000);
  assert.equal(s.passesSold, 2);
  assert.equal(s.balancePaise, 10000);
  assert.equal(s.platformPaise, 400);
});
await t('organizer sees only their own event', async () => {
  const r = await call(S.listSettlements, ORG);
  assert.deepEqual(r.data.events.map(e => e.eventId), ['comics-carnival']);
  const other = await call(S.getSettlement, ORG, { params: { eventId: 'anime-fest' } });
  assert.equal(other.code, 403);
});
await t('platform admin sees all events', async () => {
  const r = await call(S.listSettlements, ADMIN);
  assert.equal(r.data.events.length, 2);
  assert.equal(r.data.totals.owedPaise, 15000);
});

let requestId;
await t('organizer requests payout (defaults to full balance)', async () => {
  const r = await call(S.createPayoutRequest, ORG, { params: { eventId: 'comics-carnival' }, body: { payTo: 'organizer@okhdfc' } });
  assert.equal(r.code, 201, JSON.stringify(r.err));
  assert.equal(r.data.request.amountPaise, 10000);
  requestId = String(r.data.request._id);
});
await t('second open request is refused', async () => {
  const r = await call(S.createPayoutRequest, ORG, { params: { eventId: 'comics-carnival' }, body: { payTo: 'organizer@okhdfc' } });
  assert.equal(r.code, 409);
});
await t('organizer cannot request for another event', async () => {
  const r = await call(S.createPayoutRequest, OTHER_ORG, { params: { eventId: 'comics-carnival' }, body: { payTo: 'x@upi1' } });
  assert.equal(r.code, 403);
});
await t('organizer cannot record a payout', async () => {
  const r = await call(S.recordPayout, ORG, { params: { eventId: 'comics-carnival' }, body: { amountPaise: 100, method: 'CASH' } });
  assert.equal(r.code, 403);
});

await t('payout above balance is refused', async () => {
  const r = await pay({ amountPaise: 10001, method: 'UPI', reference: 'UTR1' });
  assert.equal(r.code, 400);
  assert.equal(r.err.code, 'EXCEEDS_BALANCE');
});
await t('bank/UPI payout needs a UTR', async () => {
  const r = await pay({ amountPaise: 1000, method: 'BANK_TRANSFER' });
  assert.equal(r.err.code, 'REFERENCE_REQUIRED');
});

let firstPayoutId;
await t('₹60 payout against the request: request PAID, balance ₹40', async () => {
  const r = await pay({ amountPaise: 6000, method: 'UPI', reference: 'UTR-111', requestId });
  assert.equal(r.code, 201, JSON.stringify(r.err));
  firstPayoutId = String(r.data.payout._id);
  const s = await cc();
  assert.equal(s.paidOutPaise, 6000);
  assert.equal(s.balancePaise, 4000);
  assert.equal(s.pendingRequest, null);
  assert.equal((await SettlementRequest.findById(requestId)).status, 'PAID');
});
await t('same UTR cannot be recorded twice', async () => {
  const r = await pay({ amountPaise: 1000, method: 'UPI', reference: 'UTR-111' });
  assert.equal(r.code, 409);
});
await t('5 admins record ₹30 at the same moment on ₹40 balance: only 1 goes through', async () => {
  const rs = await Promise.all([1, 2, 3, 4, 5].map(i => pay({ amountPaise: 3000, method: 'UPI', reference: `RACE-${i}` })));
  assert.equal(rs.filter(r => r.code === 201).length, 1, JSON.stringify(rs.map(r => r.err?.code)));
  const s = await cc();
  assert.equal(s.balancePaise, 1000);
  assert.ok(s.balancePaise >= 0);
});

await t('void needs a reason', async () => {
  const r = await call(S.voidPayout, ADMIN, { params: { payoutId: firstPayoutId }, body: { reason: '' } });
  assert.equal(r.code, 400);
});
await t('voiding the ₹60 payout restores the balance and reopens the request', async () => {
  const r = await call(S.voidPayout, ADMIN, { params: { payoutId: firstPayoutId }, body: { reason: 'Wrong amount entered' } });
  assert.equal(r.code, 200);
  const s = await cc();
  assert.equal(s.balancePaise, 7000);
  assert.equal((await SettlementRequest.findById(requestId)).status, 'PENDING');
  assert.equal(await Payout.countDocuments(), 2); // record kept, only marked void
});
await t('voided UTR can be recorded again correctly', async () => {
  const r = await pay({ amountPaise: 5000, method: 'UPI', reference: 'UTR-111', requestId });
  assert.equal(r.code, 201, JSON.stringify(r.err));
  assert.equal((await cc()).balancePaise, 2000);
});

await t('admin rejects a request only with a reason', async () => {
  await SettlementRequest.create({ eventId: 'anime-fest', amountPaise: 5000, payTo: 'x@upi1', requestedBy: { name: 'Other' } });
  const open = await SettlementRequest.findOne({ eventId: 'anime-fest' });
  assert.equal((await call(S.closePayoutRequest, ADMIN, { params: { requestId: open._id } })).code, 400);
  const r = await call(S.closePayoutRequest, ADMIN, { params: { requestId: open._id }, body: { reason: 'Bank details incomplete' } });
  assert.equal(r.data.request.status, 'REJECTED');
});

await t('statement CSV has the summary, daily sales and payouts', async () => {
  const r = await call(S.downloadStatement, ORG, { params: { eventId: 'comics-carnival' } });
  assert.ok(r.raw.includes('"Balance due","20.00"'), r.raw);
  assert.ok(r.raw.includes('"VOIDED"'));
  assert.ok(r.raw.includes('"Wrong amount entered"'));
  assert.ok(r.raw.includes('SALES BY DAY'));
});
await t('platform overview now shows the real platform fee (was always 0)', async () => {
  const r = await call(getPlatformOverview, ADMIN);
  assert.equal(r.data.platform.totalPlatformFeePaise, 600);
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await rs.stop();
