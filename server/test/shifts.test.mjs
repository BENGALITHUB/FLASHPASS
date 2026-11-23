// Cashier shifts: open, float, close with drawer count, admin list. In-memory MongoDB only.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';

const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { Order } = await imp('src/models/Order.js');
const { Shift } = await imp('src/models/Shift.js');
const { User } = await imp('src/models/User.js');
const POS = await imp('src/controllers/pos.controller.js');
const { listShifts } = await imp('src/controllers/admin.controller.js');
await Shift.init();

const rina = { _id: new mongoose.Types.ObjectId(), name: 'Rina', role: 'CASHIER' };
const call = async (fn, user, body = {}) => {
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; } };
  await fn({ user, body, params: {}, query: {} }, res);
  return { code, data: out?.data, err: out?.error };
};
let n = 0;
const sale = (amountPaise, { status = 'PAID', at = new Date(), cashierId = rina._id } = {}) => Order.create({
  orderId: `CC-SH${++n}`, channel: 'POS_WALKIN', holderName: 'Guest', phone: '9800000000', cashierId,
  amountPaise, organizerSharePaise: amountPaise - 200, platformFeePaise: 200, status, paidAt: at
});

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await sale(5200, { at: new Date(Date.now() - 3600_000) }); // before the shift: not counted

await t('opening the counter starts a shift', async () => {
  const r = await call(POS.getShiftSummary, rina);
  assert.equal(r.code, 200);
  assert.ok(r.data.shift.shiftId);
  assert.equal(r.data.shift.salesPaise, 0, 'earlier sales are not in this shift');
  assert.equal(await Shift.countDocuments({ status: 'OPEN' }), 1);
});
await t('two screens at once still give one open shift', async () => {
  await Promise.all([1, 2, 3].map(() => call(POS.getShiftSummary, rina)));
  assert.equal(await Shift.countDocuments({ cashierId: rina._id, status: 'OPEN' }), 1);
});
await t('cash at start is added to what should be in the drawer', async () => {
  await call(POS.setShiftFloat, rina, { openingFloatPaise: 50000 });
  await sale(5200); await sale(10400);
  await sale(5200, { status: 'VOIDED' }); // undone sale: not counted
  const r = await call(POS.getShiftSummary, rina);
  assert.equal(r.data.shift.salesPaise, 15600);
  assert.equal(r.data.shift.expectedInDrawerPaise, 65600);
  assert.equal(r.data.totalCashPaise, 15600);
});
await t('a drawer that does not match needs a note', async () => {
  const r = await call(POS.closeShift, rina, { countedPaise: 65000 });
  assert.equal(r.code, 400);
  assert.equal(r.err.code, 'NOTE_REQUIRED');
  assert.match(r.err.message, /short by ₹6/);
});
await t('closing records counted cash and the difference', async () => {
  const r = await call(POS.closeShift, rina, { countedPaise: 65000, notes: 'Gave ₹6 extra change by mistake' });
  assert.equal(r.code, 200, JSON.stringify(r.err));
  assert.equal(r.data.shift.differencePaise, -600);
  assert.equal(r.data.shift.expectedPaise, 65600);
  const s = await Shift.findById(r.data.shift.shiftId);
  assert.equal(s.status, 'CLOSED');
});
await t('closing twice is refused', async () => {
  const r = await call(POS.closeShift, rina, { countedPaise: 1000 });
  assert.equal(r.code, 404);
});
await t('next use starts a fresh shift at ₹0', async () => {
  const r = await call(POS.getShiftSummary, rina);
  assert.equal(r.data.shift.salesPaise, 0);
  assert.equal(r.data.shift.openingFloatPaise, 0);
  assert.equal(await Shift.countDocuments({ cashierId: rina._id }), 2);
});
await t('a matching drawer closes without a note', async () => {
  await sale(5200);
  const r = await call(POS.closeShift, rina, { countedPaise: 5200 });
  assert.equal(r.code, 200);
  assert.equal(r.data.shift.differencePaise, 0);
});
await t('admin sees all shifts with totals; organizer sees only their event', async () => {
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' };
  const r = await call(listShifts, admin);
  assert.equal(r.data.totals.closedShifts, 2);
  assert.equal(r.data.totals.shortShifts, 1);
  assert.equal(r.data.totals.netDifferencePaise, -600);

  await User.collection.insertOne({ _id: rina._id, username: 'rina', name: 'Rina', role: 'CASHIER', assignedEventId: 'comics-carnival' });
  const own = await call(listShifts, { role: 'EVENT_ADMIN', assignedEventId: 'comics-carnival' });
  assert.equal(own.data.shifts.length, 2);
  const other = await call(listShifts, { role: 'EVENT_ADMIN', assignedEventId: 'anime-fest' });
  assert.equal(other.data.shifts.length, 0);
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
