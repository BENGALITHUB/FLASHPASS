// Stall inquiries take their price from the fixed price list. In-memory MongoDB only.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Inquiry } = await imp('src/models/Inquiry.js');
const { createInquiry } = await imp('src/controllers/inquiry.controller.js');

const call = async (body) => {
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; } };
  await createInquiry({ body, headers: {} }, res);
  return { code, data: out?.data, err: out?.error };
};
const base = { type: 'STALL', brandName: 'MangaCraft', contactPerson: 'Rahul Sen', phone: '9876543210', email: 'a@b.com' };

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await t('price comes from the list, not the request', async () => {
  const r = await call({ ...base, stallType: 'PREMIUM_3_5X2', stallPriceRupees: 1, priceNote: '  Can you do ₹12,000?  ' });
  assert.equal(r.code, 201);
  assert.equal(r.data.stallPriceRupees, 13250);
  const saved = await Inquiry.findOne({ inquiryId: r.data.inquiryId }).lean();
  assert.equal(saved.stallPriceRupees, 13250);
  assert.equal(saved.stallLabel, 'Premium Stall (3.5×2 sq m)');
  assert.equal(saved.priceNote, 'Can you do ₹12,000?');
});
await t('unknown stall size is refused', async () => {
  const r = await call({ ...base, stallType: 'ARTIST_ALLEY' });
  assert.equal(r.code, 400);
});
await t('sponsor inquiries get no stall price', async () => {
  const r = await call({ ...base, type: 'SPONSOR', stallType: 'FOOD_STALL', priceNote: 'x' });
  assert.equal(r.code, 201);
  const saved = await Inquiry.findOne({ inquiryId: r.data.inquiryId }).lean();
  assert.equal(saved.stallPriceRupees, undefined);
  assert.equal(saved.priceNote, undefined);
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
