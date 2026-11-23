// Checks that an order cannot become PAID without gateway proof.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);

const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(rs.getUri());

const { Order } = await imp('src/models/Order.js');
const { Pass } = await imp('src/models/Pass.js');
const { Event } = await imp('src/models/Event.js');
const { mockPayOrder, verifyGatewayPayment } = await imp('src/controllers/order.controller.js');

const call = async (fn, req) => {
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; } };
  await fn({ query: {}, body: {}, params: {}, ...req }, res);
  return { code, out };
};

await Event.create({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200 });
// Create collections up front: a transaction cannot create them on first write
await Promise.all(['passes', 'ledgerentries', 'adminsettings'].map(c => mongoose.connection.createCollection(c).catch(() => {})));

let n = 0;
const mkOrder = () => Order.create({
  orderId: `CC-PAY${++n}`, channel: 'ONLINE', holderName: 'Fan', phone: '9800000000',
  amountPaise: 5200, organizerSharePaise: 5000, platformFeePaise: 200, status: 'CREATED'
});
const status = async (id) => (await Order.findOne({ orderId: id })).status;

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

console.log('Live-like setup (no ALLOW_MOCK_PAYMENTS)');
delete process.env.ALLOW_MOCK_PAYMENTS;
process.env.NODE_ENV = 'development';

await t('mock-pay is 404 and order stays unpaid', async () => {
  const o = await mkOrder();
  const r = await call(mockPayOrder, { params: { orderId: o.orderId } });
  assert.equal(r.code, 404);
  assert.equal(await status(o.orderId), 'CREATED');
});
for (const provider of ['PHONEPE', 'CASHFREE', 'STRIPE', 'RAZORPAY']) {
  await t(`verify-gateway with ${provider} and no proof is refused`, async () => {
    const o = await mkOrder();
    const r = await call(verifyGatewayPayment, { params: { orderId: o.orderId }, body: { provider } });
    assert.equal(r.code, 400);
    assert.equal(r.out.error.code, 'PAYMENT_NOT_VERIFIED');
    assert.equal(await status(o.orderId), 'CREATED');
  });
}
await t('fake Razorpay signature with placeholder key is refused', async () => {
  const o = await mkOrder();
  const r = await call(verifyGatewayPayment, { params: { orderId: o.orderId }, body: { provider: 'RAZORPAY', razorpay_payment_id: 'pay_x', razorpay_signature: 'abc' } });
  assert.equal(r.code, 400);
  assert.equal(await status(o.orderId), 'CREATED');
});
await t('no pass was issued for any refused order', async () => {
  assert.equal(await Pass.countDocuments(), 0);
});

console.log('Flag set but NODE_ENV=production');
process.env.ALLOW_MOCK_PAYMENTS = 'true';
process.env.NODE_ENV = 'production';
await t('mock-pay still refused in production', async () => {
  const o = await mkOrder();
  assert.equal((await call(mockPayOrder, { params: { orderId: o.orderId } })).code, 404);
  assert.equal(await status(o.orderId), 'CREATED');
});

console.log('Local development with ALLOW_MOCK_PAYMENTS=true');
process.env.NODE_ENV = 'development';
await t('mock-pay works for local testing', async () => {
  const o = await mkOrder();
  const r = await call(mockPayOrder, { params: { orderId: o.orderId } });
  assert.equal(r.code, 200, JSON.stringify(r.out));
  assert.equal(await status(o.orderId), 'PAID');
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await rs.stop();
