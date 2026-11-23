// Paid-but-browser-never-returned orders get their pass via PayU verify. PayU is mocked.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(rs.getUri());
for (const c of ['passes', 'ledgerentries', 'adminsettings', 'events', 'orders']) await mongoose.connection.createCollection(c).catch(() => {});

const { Order } = await imp('src/models/Order.js');
const { Pass } = await imp('src/models/Pass.js');
const { Event } = await imp('src/models/Event.js');
const { LedgerEntry } = await imp('src/models/LedgerEntry.js');
const R = await imp('src/services/reconcile.service.js');
const { getOrderStatus } = await imp('src/controllers/order.controller.js');

await Event.create({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200 });

// Mock PayU: answers from this table, records every call
const payu = {}; const calls = [];
globalThis.fetch = async (url, opts) => {
  const p = new URLSearchParams(opts.body);
  calls.push(p.get('var1'));
  assert.equal(p.get('command'), 'verify_payment');
  assert.match(p.get('hash'), /^[0-9a-f]{128}$/);
  const txn = p.get('var1');
  const d = payu[txn] || { status: 'Not Found' };
  return { ok: true, json: async () => ({ status: 1, msg: '1 out of 1 Transactions Fetched Successfully', transaction_details: { [txn]: d } }) };
};

let n = 0;
const mk = async ({ ageMin = 5, provider = 'PAYU', channel = 'ONLINE', amountPaise = 5200 } = {}) => {
  const o = await Order.create({
    orderId: `CC-R${++n}`, channel, holderName: 'Fan', phone: '9800000000',
    amountPaise, organizerSharePaise: amountPaise - 200, platformFeePaise: 200, status: 'CREATED',
    gateway: { provider }
  });
  await Order.collection.updateOne({ _id: o._id }, { $set: { createdAt: new Date(Date.now() - ageMin * 60000) } });
  return Order.findById(o._id);
};
const status = async (id) => (await Order.findOne({ orderId: id })).status;

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

const paid = await mk();
payu[paid.orderId] = { status: 'success', mihpayid: '403993715531234567', amt: '52.00', mode: 'UPI' };
const short = await mk();
payu[short.orderId] = { status: 'success', mihpayid: '403993715539999999', amt: '1.00', mode: 'UPI' };
const failed = await mk();
payu[failed.orderId] = { status: 'failure', mihpayid: '403993715530000001', amt: '52.00' };
const unknown = await mk();
const tooNew = await mk({ ageMin: 0 });
payu[tooNew.orderId] = { status: 'success', mihpayid: 'X', amt: '52.00' };
const old = await mk({ ageMin: 60 * 30 });
payu[old.orderId] = { status: 'success', mihpayid: 'Y', amt: '52.00' };
const cash = await mk({ channel: 'POS_WALKIN', provider: 'MOCK_UPI' });

await t('job: paid order gets PAID + pass + ledger entry', async () => {
  const counts = await R.runReconciliation();
  assert.equal(counts.PAID, 1);
  assert.equal(await status(paid.orderId), 'PAID');
  assert.equal(await Pass.countDocuments({ orderId: paid.orderId }), 1);
  assert.equal(await LedgerEntry.countDocuments({ orderId: paid.orderId }), 1);
  assert.equal((await Order.findOne({ orderId: paid.orderId })).gateway.paymentId, '403993715531234567');
});
await t('PayU says paid but for less money: no pass', async () => {
  assert.equal(await status(short.orderId), 'CREATED');
  assert.equal(await Pass.countDocuments({ orderId: short.orderId }), 0);
  assert.equal((await Order.findOne({ orderId: short.orderId })).gateway.lastCheckStatus, 'amount mismatch');
});
await t('failed / unknown payments stay waiting, check is recorded', async () => {
  assert.equal(await status(failed.orderId), 'CREATED');
  assert.equal(await status(unknown.orderId), 'CREATED');
  const u = await Order.findOne({ orderId: unknown.orderId });
  assert.equal(u.gateway.checkCount, 1);
  assert.equal(u.gateway.lastCheckStatus, 'not found');
});
await t('not checked: under 1 minute old, older than a day, cash orders', async () => {
  assert.ok(!calls.includes(tooNew.orderId));
  assert.ok(!calls.includes(old.orderId));
  assert.ok(!calls.includes(cash.orderId));
});
await t('second run right away does not re-ask PayU (throttled)', async () => {
  const before = calls.length;
  await R.runReconciliation();
  assert.equal(calls.length, before);
});
await t('paying twice is impossible: re-running on a PAID order does nothing', async () => {
  const o = await Order.findOne({ orderId: paid.orderId });
  assert.equal(await R.reconcileOrder(o), 'SKIPPED');
  assert.equal(await Pass.countDocuments({ orderId: paid.orderId }), 1);
});

const call = async (orderId) => {
  let out;
  const res = { status() { return this; }, json(b) { out = b; return this; } };
  await getOrderStatus({ params: { orderId }, query: {}, body: {} }, res);
  return out.data;
};
await t('buyer\'s payment page poll confirms a paid order and returns the pass', async () => {
  const late = await mk({ ageMin: 2 });
  payu[late.orderId] = { status: 'success', mihpayid: 'Z1', amt: '52.00', mode: 'UPI' };
  const d = await call(late.orderId);
  assert.equal(d.status, 'PAID');
  assert.ok(d.pass?.qrToken || d.passes?.[0]?.qrToken, JSON.stringify(d).slice(0, 200));
});
await t('page polls every 2s but PayU is asked at most once per 20s', async () => {
  const w = await mk({ ageMin: 2 });
  const before = calls.length;
  for (let i = 0; i < 5; i++) await call(w.orderId);
  assert.equal(calls.length - before, 1);
});
await t('PayU unreachable: order stays waiting, no crash', async () => {
  const w = await mk({ ageMin: 3 });
  const saved = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal(await R.reconcileOrder(w), 'WAITING');
  globalThis.fetch = saved;
  assert.match((await Order.findOne({ orderId: w.orderId })).gateway.lastCheckStatus, /network down/);
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await rs.stop();
