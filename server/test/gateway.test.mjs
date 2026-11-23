// Online payment setup: no public PayU keys in production, forged or mismatched
// PayU callbacks never issue a pass, unfinished gateways cannot take orders, and
// gateway secrets never reach the admin's browser.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert/strict';
import crypto from 'crypto';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(rs.getUri());
for (const c of ['passes', 'ledgerentries', 'adminsettings', 'events', 'orders', 'auditlogs']) {
  await mongoose.connection.createCollection(c).catch(() => {});
}

const { Event } = await imp('src/models/Event.js');
const { Order } = await imp('src/models/Order.js');
const { Pass } = await imp('src/models/Pass.js');
const { AdminSettings } = await imp('src/models/AdminSettings.js');
const { createOrder, handlePayUCallback } = await imp('src/controllers/order.controller.js');
const { getDashboardMetrics, updateSettings } = await imp('src/controllers/admin.controller.js');
const { gatewaySettingsForAdmin, mergeGatewaySettings } = await imp('src/services/gateway.service.js');

const s = await AdminSettings.getSettings();
s.onePassPerPhone = false;
s.eventDays = [{ day: 1, date: '2099-01-01', label: 'Day 1' }]; // sales open
await s.save();
await Event.create({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200, capacityLimit: 100 });

const ADMIN = { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN', name: 'A' };
const call = async (fn, body, extra = {}) => {
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; } };
  await fn({ body, user: ADMIN, query: {}, params: {}, get: () => 'localhost', protocol: 'http', ...extra }, res);
  return { code, data: out?.data, err: out?.error };
};
let phone = 9100000000;
const buy = () => call(createOrder, { name: 'Fan', phone: String(++phone), eventId: 'comics-carnival' });

// What PayU posts back, signed with the given key and salt
const payuBody = ({ txnid, amount, key, salt, status = 'success' }) => {
  const f = {
    key, txnid, amount, productinfo: 'General', firstname: 'Fan', email: 'guest@comicscarnival.com',
    status, mihpayid: `mih_${txnid}`, udf1: 'comics-carnival', udf2: 'general'
  };
  // PayU reverse hash: salt|status|udf10..udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
  const seq = [salt, status, '', '', '', '', '', '', '', '', f.udf2, f.udf1, f.email, f.firstname, f.productinfo, amount, txnid, key];
  f.hash = crypto.createHash('sha512').update(seq.join('|')).digest('hex');
  return f;
};
const callback = async (body) => {
  let location = null;
  await handlePayUCallback({ body, query: {} }, { redirect(u) { location = u; } });
  return location;
};
const orderStatus = async (id) => (await Order.findOne({ orderId: id }))?.status;

const PUBLIC_KEY = 'Se8qmO';
const PUBLIC_SALT = '0R5yPuaFXfEicsHhpU3tLxc5QoIeciyW';
const LIVE_KEY = 'liveKey1';
const LIVE_SALT = 'liveSalt_only_this_server_knows_it_123';

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

delete process.env.ALLOW_MOCK_PAYMENTS;

console.log('Production, PayU keys not set');
process.env.NODE_ENV = 'production';
delete process.env.PAYU_MERCHANT_KEY;
delete process.env.PAYU_MERCHANT_SALT;

await t('online order is refused with PAYMENT_NOT_CONFIGURED and nothing is saved', async () => {
  const before = await Order.countDocuments();
  const r = await buy();
  assert.equal(r.code, 503, JSON.stringify(r));
  assert.equal(r.err.code, 'PAYMENT_NOT_CONFIGURED');
  assert.equal(await Order.countDocuments(), before);
});

let victim;
await t('a callback signed with PayU\'s public test salt does not mark the order paid', async () => {
  victim = await Order.create({
    orderId: 'CC-FORGE001', eventId: 'comics-carnival', channel: 'ONLINE', holderName: 'Fan', phone: '9800000001',
    tierId: 'general', tierName: 'General', amountPaise: 5200, organizerSharePaise: 5000, platformFeePaise: 200,
    status: 'CREATED', gateway: { provider: 'PAYU' }
  });
  const loc = await callback(payuBody({ txnid: victim.orderId, amount: '52.00', key: PUBLIC_KEY, salt: PUBLIC_SALT }));
  assert.match(loc, /payu=tampered/);
  assert.equal(await orderStatus(victim.orderId), 'CREATED');
});

await t('setting the public test salt in .env still counts as not configured', async () => {
  process.env.PAYU_MERCHANT_KEY = PUBLIC_KEY;
  process.env.PAYU_MERCHANT_SALT = PUBLIC_SALT;
  assert.equal((await buy()).err.code, 'PAYMENT_NOT_CONFIGURED');
  const loc = await callback(payuBody({ txnid: victim.orderId, amount: '52.00', key: PUBLIC_KEY, salt: PUBLIC_SALT }));
  assert.match(loc, /payu=tampered/);
  assert.equal(await orderStatus(victim.orderId), 'CREATED');
});

console.log('Production, real PayU keys set');
process.env.PAYU_MERCHANT_KEY = LIVE_KEY;
process.env.PAYU_MERCHANT_SALT = LIVE_SALT;

let order;
await t('online order is created with PayU params', async () => {
  const r = await buy();
  assert.equal(r.code, 201, JSON.stringify(r.err));
  assert.equal(r.data.payu.params.key, LIVE_KEY);
  assert.ok(!JSON.stringify(r.data).includes(LIVE_SALT), 'salt must not be in the response');
  order = await Order.findOne({ orderId: r.data.orderId });
});

await t('callback with a valid hash but a different amount issues no pass', async () => {
  const loc = await callback(payuBody({ txnid: order.orderId, amount: '1.00', key: LIVE_KEY, salt: LIVE_SALT }));
  assert.match(loc, /payu=error/);
  assert.equal(await orderStatus(order.orderId), 'CREATED');
});

await t('callback naming another merchant key is refused', async () => {
  const loc = await callback(payuBody({ txnid: order.orderId, amount: '52.00', key: 'otherKey', salt: LIVE_SALT }));
  assert.match(loc, /payu=tampered/);
  assert.equal(await orderStatus(order.orderId), 'CREATED');
});

await t('callback for an unknown order is refused', async () => {
  const loc = await callback(payuBody({ txnid: 'CC-NOPE0000', amount: '52.00', key: LIVE_KEY, salt: LIVE_SALT }));
  assert.match(loc, /invalid_payu_callback/);
});

await t('genuine PayU callback marks the order paid and issues the pass', async () => {
  const loc = await callback(payuBody({ txnid: order.orderId, amount: '52.00', key: LIVE_KEY, salt: LIVE_SALT }));
  assert.match(loc, /payment=success/);
  assert.equal(await orderStatus(order.orderId), 'PAID');
  assert.equal(await Pass.countDocuments({ orderId: order.orderId }), 1);
});

console.log('Admin switches');
await t('online sales switched off: order refused', async () => {
  await Event.updateOne({ eventId: 'comics-carnival' }, { onlineSalesEnabled: false });
  const r = await buy();
  assert.equal(r.code, 400);
  assert.equal(r.err.code, 'ONLINE_SALES_CLOSED');
  await Event.updateOne({ eventId: 'comics-carnival' }, { onlineSalesEnabled: true });
});

await t('an event still saved on Razorpay cannot take online orders', async () => {
  await Event.updateOne({ eventId: 'comics-carnival' }, { 'paymentGateway.provider': 'RAZORPAY' });
  const r = await buy();
  assert.equal(r.code, 503);
  assert.equal(r.err.code, 'PAYMENT_NOT_CONFIGURED');
  await Event.updateOne({ eventId: 'comics-carnival' }, { 'paymentGateway.provider': 'PAYU' });
});

await t('admin cannot switch an event to a gateway that is not available', async () => {
  const merged = mergeGatewaySettings({ provider: 'PHONEPE' }, { provider: 'PAYU' });
  assert.match(merged.error, /not available/);
});

console.log('Gateway secrets');
await t('saving the form with a blank salt keeps the saved salt', async () => {
  const first = mergeGatewaySettings({ provider: 'PAYU', usePlatformDefault: false, merchantKey: 'orgKey', merchantSalt: 'orgSalt_secret' }, {});
  const again = mergeGatewaySettings({ provider: 'PAYU', usePlatformDefault: false, merchantKey: 'orgKey', merchantSalt: '' }, first.value);
  assert.equal(again.value.merchantSalt, 'orgSalt_secret');
});

await t('settings API and event JSON never contain the salt', async () => {
  const ev = await Event.findOne({ eventId: 'comics-carnival' });
  ev.paymentGateway = { ...ev.paymentGateway, usePlatformDefault: false, merchantKey: 'orgKey', merchantSalt: 'orgSalt_secret', env: 'TEST' };
  await ev.save();

  const view = gatewaySettingsForAdmin(ev);
  assert.equal(view.merchantSalt, '');
  assert.equal(view.savedSecrets.merchantSalt, true);
  assert.equal(view.ready, true);
  assert.ok(!JSON.stringify(ev).includes('orgSalt_secret'), 'event toJSON leaks the salt');

  const r = await call(getDashboardMetrics, {}, { query: { eventId: 'comics-carnival' } });
  assert.equal(r.code, 200, JSON.stringify(r.err));
  assert.ok(!JSON.stringify(r.data).includes('orgSalt_secret'), 'GET settings leaks the salt');
  assert.ok(!JSON.stringify(r.data).includes(LIVE_SALT), 'GET settings leaks the platform salt');

  const u = await call(updateSettings, { eventId: 'comics-carnival', paymentGateway: { provider: 'PAYU', usePlatformDefault: false, merchantKey: 'orgKey', merchantSalt: '' } });
  assert.equal(u.code, 200, JSON.stringify(u.err));
  assert.ok(!JSON.stringify(u.data).includes('orgSalt_secret'), 'PATCH settings leaks the salt');
  assert.equal((await Event.findOne({ eventId: 'comics-carnival' })).paymentGateway.merchantSalt, 'orgSalt_secret');
});

console.log('Local development');
process.env.NODE_ENV = 'development';
delete process.env.PAYU_MERCHANT_KEY;
delete process.env.PAYU_MERCHANT_SALT;
await Event.updateOne({ eventId: 'comics-carnival' }, { 'paymentGateway.usePlatformDefault': true });
await t('without keys, local checkout uses the PayU sandbox', async () => {
  const r = await buy();
  assert.equal(r.code, 201, JSON.stringify(r.err));
  assert.equal(r.data.payu.params.key, PUBLIC_KEY);
  assert.match(r.data.payu.actionUrl, /test\.payu\.in/);
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await rs.stop();
