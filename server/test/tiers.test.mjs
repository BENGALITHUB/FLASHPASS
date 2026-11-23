// Admin-managed ticket types: saving rules, per-type capacity, pricing at checkout.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

// Runs against a throwaway in-memory MongoDB, never a real database
const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Event } = await imp('src/models/Event.js');
const { Pass } = await imp('src/models/Pass.js');
const { AdminSettings } = await imp('src/models/AdminSettings.js');
const { updateSettings } = await imp('src/controllers/admin.controller.js');
const { createOrder } = await imp('src/controllers/order.controller.js');

const s = await AdminSettings.getSettings();
s.onePassPerPhone = false;
s.eventDays = [{ day: 1, date: '2099-01-01', label: 'Day 1' }]; // sales open
await s.save();
await Event.create({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200, capacityLimit: 100 });

const ADMIN = { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN', name: 'A' };
const call = async (fn, body, user = ADMIN) => {
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; } };
  await fn({ body, user, query: {}, params: {}, get: () => 'localhost', protocol: 'http' }, res);
  return { code, data: out?.data, err: out?.error };
};
const save = (ticketTiers) => call(updateSettings, { eventId: 'comics-carnival', ticketTiers });
const tiers = async () => (await Event.findOne({ eventId: 'comics-carnival' })).ticketTiers;
let phone = 9000000000;
const buy = (tierId) => call(createOrder, { name: 'Fan', phone: String(++phone), eventId: 'comics-carnival', tierId });

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await t('no ticket types: order is a General pass at the event price', async () => {
  const r = await buy('vip');
  assert.equal(r.code, 201, JSON.stringify(r.err));
  const o = r.data.order || r.data;
  assert.equal(o.amountPaise ?? o.totalAmountPaise ?? r.data.amountPaise, 5200, JSON.stringify(r.data).slice(0, 300));
});

await t('admin adds two ticket types; ids are made from names; fee comes from the event', async () => {
  const r = await save([
    { name: 'General Pass', pricePaise: 5000, capacity: 0, perks: ['Entry'], badge: 'general' },
    { name: 'Superfan', pricePaise: 15000, capacity: 2, perks: ['Free comic'], featured: true, platformFeePaise: 1 }
  ]);
  assert.equal(r.code, 200, JSON.stringify(r.err));
  const ts = await tiers();
  assert.deepEqual(ts.map(x => x.tierId), ['general-pass', 'superfan']);
  assert.equal(ts[0].badge, 'GENERAL');
  assert.equal(ts[1].featured, true);
  assert.equal(ts[1].platformFeePaise, 200, 'browser cannot set the platform fee');
});

await t('Superfan costs ₹150 + ₹2', async () => {
  const r = await buy('superfan');
  assert.equal(r.code, 201, JSON.stringify(r.err));
  assert.equal(JSON.stringify(r.data).includes('15200'), true);
});

await t('per-type limit counts only that type (General sales do not use up Superfan)', async () => {
  // Make 5 General passes exist
  for (let i = 0; i < 5; i++) await Pass.create({ orderId: `CC-G${i}`, eventId: 'comics-carnival', tierId: 'general-pass', holderName: 'x', phone: '9800000000', badge: 'GENERAL', validDays: [1] });
  await Pass.create({ orderId: 'CC-SF1', eventId: 'comics-carnival', tierId: 'superfan', holderName: 'x', phone: '9800000000', badge: 'SUPERFAN', validDays: [1] });
  assert.equal((await buy('superfan')).code, 201, 'one Superfan left of 2');
  await Pass.create({ orderId: 'CC-SF2', eventId: 'comics-carnival', tierId: 'superfan', holderName: 'x', phone: '9800000000', badge: 'SUPERFAN', validDays: [1] });
  const r = await buy('superfan');
  assert.equal(r.code, 400);
  assert.match(r.err.message, /Superfan/);
});

await t('a ticket type with sales cannot be deleted', async () => {
  const r = await save([{ tierId: 'general-pass', name: 'General Pass', pricePaise: 5000, capacity: 0 }]);
  assert.equal(r.code, 400);
  assert.match(r.err.message, /Superfan.*can't be deleted/);
  assert.equal((await tiers()).length, 2);
});

await t('switching it off works, and it can no longer be bought', async () => {
  const r = await save([
    { tierId: 'general-pass', name: 'General Pass', pricePaise: 5000, capacity: 0 },
    { tierId: 'superfan', name: 'Superfan', pricePaise: 15000, capacity: 2, active: false }
  ]);
  assert.equal(r.code, 200, JSON.stringify(r.err));
  const ts = await tiers();
  assert.equal(ts.find(x => x.tierId === 'superfan').active, false);
  const r2 = await buy('superfan');
  assert.equal(r2.code, 400);
  assert.equal(r2.err.code, 'TIER_NOT_ON_SALE');
  assert.equal((await buy('general-pass')).code, 201);
});

await t('bad input is refused', async () => {
  assert.equal((await save([{ name: 'X', pricePaise: 100 }])).code, 400);
  assert.equal((await save([{ name: 'Okay', pricePaise: -5 }])).code, 400);
  assert.equal((await save([{ name: 'Okay', pricePaise: 100, capacity: 1.5 }])).code, 400);
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
