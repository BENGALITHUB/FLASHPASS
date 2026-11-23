// CSV exports: phones masked by default, full phones only on request and
// audited, the orders export exists, and buyer-typed text cannot run as a
// spreadsheet formula.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Order } = await imp('src/models/Order.js');
const { Pass } = await imp('src/models/Pass.js');
const { AuditLog } = await imp('src/models/AuditLog.js');
const { exportCSV, maskPhoneForExport } = await imp('src/controllers/admin.controller.js');

const ADMIN = { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN', name: 'Admin A' };
const ORGANIZER = { _id: new mongoose.Types.ObjectId(), role: 'EVENT_ADMIN', name: 'Org B', assignedEventId: 'other-fest' };

const exportAs = async (type, query = {}, user = ADMIN) => {
  let body = '', code = 200, json;
  const headers = {};
  const res = {
    status(c) { code = c; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    send(b) { body = b; return this; },
    json(b) { json = b; return this; }
  };
  await exportCSV({ params: { type }, query, user }, res);
  return { code, body, headers, json };
};

const PHONE = '9876543210';
const EVIL = '=HYPERLINK("http://evil.example","click")';
await Order.create({
  orderId: 'CC-EXP00001', eventId: 'comics-carnival', channel: 'ONLINE', holderName: EVIL, phone: PHONE,
  tierName: 'General', amountPaise: 5200, subtotalPaise: 5000, organizerSharePaise: 5000, platformFeePaise: 200,
  status: 'PAID', gateway: { provider: 'PAYU', method: 'UPI', paymentId: 'mih_1' }, paidAt: new Date()
});
await Pass.create({
  orderId: 'CC-EXP00001', eventId: 'comics-carnival', holderName: EVIL, phone: PHONE, badge: 'DAY 1',
  validDays: [1], qrNonce: 'n1', status: 'ACTIVE'
});
await Order.create({
  orderId: 'CC-EXP00002', eventId: 'other-fest', channel: 'POS_WALKIN', holderName: 'Other Fan', phone: '9123456789',
  amountPaise: 5000, organizerSharePaise: 4800, platformFeePaise: 200, status: 'CREATED'
});

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await t('mask keeps the first 2 and last 3 digits', async () => {
  assert.equal(maskPhoneForExport(PHONE), '98*****210');
  assert.equal(maskPhoneForExport(''), '');
});

for (const type of ['passes', 'orders', 'footfall']) {
  await t(`${type} export masks phones by default`, async () => {
    const r = await exportAs(type, { eventId: 'comics-carnival' });
    assert.equal(r.code, 200, JSON.stringify(r.json));
    assert.ok(!r.body.includes(PHONE), `${type} leaks the full phone`);
    if (type !== 'footfall' || r.body.split('\n').length > 2) assert.ok(r.body.includes('98*****210'), r.body);
  });
}

await t('full phones only with includeFullPhone=1, and it is audited', async () => {
  const before = await AuditLog.countDocuments({ action: 'EXPORT_FULL_PHONE' });
  const r = await exportAs('orders', { eventId: 'comics-carnival', includeFullPhone: '1' });
  assert.ok(r.body.includes(PHONE));
  const logs = await AuditLog.find({ action: 'EXPORT_FULL_PHONE' }).lean();
  assert.equal(logs.length, before + 1);
  assert.equal(logs.at(-1).actorName, 'Admin A');
  assert.match(logs.at(-1).target, /orders CSV \(comics-carnival\)/);
});

await t('exports without phones ignore includeFullPhone and log nothing', async () => {
  const before = await AuditLog.countDocuments();
  await exportAs('ledger', { includeFullPhone: '1' });
  assert.equal(await AuditLog.countDocuments(), before);
});

await t('orders export has the money and payment columns', async () => {
  const r = await exportAs('orders', { eventId: 'comics-carnival' });
  const [header, row] = r.body.trim().split('\n');
  assert.match(header, /^OrderId,EventId,Channel,Status,HolderName,Phone,/);
  assert.match(row, /"CC-EXP00001"/);
  assert.match(row, /,52\.00,50\.00,2\.00,"PAYU","UPI","mih_1",/);
});

await t('an organizer only exports their own event', async () => {
  const r = await exportAs('orders', { eventId: 'comics-carnival' }, ORGANIZER);
  assert.ok(r.body.includes('CC-EXP00002'));
  assert.ok(!r.body.includes('CC-EXP00001'));
});

await t('a name written as a formula is exported as plain text', async () => {
  for (const type of ['passes', 'orders']) {
    const r = await exportAs(type, { eventId: 'comics-carnival' });
    assert.ok(!r.body.includes(',"=HYPERLINK'), `${type} lets a formula through`);
    assert.ok(r.body.includes(`"'=HYPERLINK(""http://evil.example"",""click"")"`), r.body);
  }
});

await t('unknown export type is refused', async () => {
  const r = await exportAs('users');
  assert.equal(r.code, 400);
});

await t('CSV is not cached', async () => {
  const r = await exportAs('passes');
  assert.equal(r.headers['cache-control'], 'no-store');
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
