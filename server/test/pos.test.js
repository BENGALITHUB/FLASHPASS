import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { getCashPricing, getCashAvailability, getCashTiers, priceCashAddOns, getTodayRange, validateCash } from '../src/utils/pos.utils.js';
import { toPaise } from '../../client/src/utils/pos.js';
import { confirmTokenPayment, walkinSale, undoLastConfirmation, getShiftSummary, lookupToken } from '../src/controllers/pos.controller.js';
import { AdminSettings } from '../src/models/AdminSettings.js';
import { Event } from '../src/models/Event.js';
import { CashToken } from '../src/models/CashToken.js';
import { Order } from '../src/models/Order.js';
import { Pass } from '../src/models/Pass.js';
import { Shift } from '../src/models/Shift.js';

const settings = { basePricePaise: 13750, platformFeePaise: 250, cashPriceMode: 'INCLUSIVE_TOTAL', cashSalesEnabled: true, eventDays: [] };
// The cashier sells for their own event.
const req = (body = {}) => ({ body, params: { tokenNo: '142' }, user: { _id: new mongoose.Types.ObjectId(), assignedEventId: 'test-event' } });
const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
function setup(t, overrides = {}) {
  t.mock.method(AdminSettings, 'getSettings', async () => ({ ...settings, ...overrides }));
  t.mock.method(Event, 'findOne', async () => ({ eventId: 'test-event', status: 'ACTIVE' }));
}
afterEach(() => test.mock.restoreAll());

test('cash pricing uses current settings and preserves the platform fee when absorbed', () => {
  const inclusive = getCashPricing(settings);
  assert.equal(inclusive.amountPaise, 14000);
  assert.equal(inclusive.organizerSharePaise + inclusive.platformFeePaise, inclusive.amountPaise);
  const absorbed = getCashPricing({ ...settings, cashPriceMode: 'ORGANIZER_ABSORBS_FEE' });
  assert.equal(absorbed.amountPaise, 13750);
  assert.equal(absorbed.organizerSharePaise, 13500);
  assert.equal(absorbed.platformFeePaise, 250);
  assert.equal(absorbed.customerFeePaise, 0);
});
test('invalid or negative pricing is rejected', () => {
  for (const price of [-1, NaN, 1.25, Infinity]) assert.throws(() => getCashPricing({ ...settings, basePricePaise: price }));
  assert.throws(() => getCashPricing({ ...settings, basePricePaise: 100, cashPriceMode: 'ORGANIZER_ABSORBS_FEE' }));
});
test('cash parsing is exact to the paise and refuses blank, fractional paise and exponent values', () => {
  assert.equal(toPaise('137.50'), 13750);
  assert.equal(toPaise('0.29'), 29);
  assert.equal(toPaise('100'), 10000);
  for (const value of ['', ' ', '-1', '1e2', '1.009', 'NaN', 'Infinity', '12.']) assert.equal(toPaise(value), null);
});
test('underpayments, malformed cash and a stale quote cannot settle', () => {
  for (const value of [undefined, null, '14000', -1, NaN, Infinity, 1.2]) assert.throws(() => validateCash(value, 14000), { code: 'INVALID_CASH' });
  assert.throws(() => validateCash(13999, 14000), { code: 'INSUFFICIENT_CASH' });
  assert.throws(() => validateCash(15000, 14000, 5200), { code: 'PRICE_CHANGED' });
  assert.doesNotThrow(() => validateCash(14000, 14000, 14000));
});
test('cash sales honor both organizer and event pauses', () => {
  assert.equal(getCashAvailability(settings).salesOpen, true);
  assert.equal(getCashAvailability({ ...settings, cashSalesEnabled: false }).salesOpen, false);
  assert.equal(getCashAvailability(settings, { emergencyLockdown: true }).salesOpen, false);
  assert.equal(getCashAvailability(settings, { cashSalesEnabled: false }).salesOpen, false);
});
test('daily totals use one IST calendar day, independent of host timezone', () => {
  const range = getTodayRange();
  assert.equal(range.end - range.start, 86400000);
  assert.equal(range.start.toISOString().slice(11), '18:30:00.000Z');
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(range.start), range.date);
});
test('both payment endpoints reject underpayment before starting a transaction', async t => {
  setup(t);
  const tx = t.mock.method(mongoose.connection, 'transaction', () => { throw new Error('Must not write'); });
  for (const controller of [confirmTokenPayment, walkinSale]) {
    const res = response();
    await controller(req({ cashTenderedPaise: 13999 }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INSUFFICIENT_CASH');
  }
  assert.equal(tx.mock.callCount(), 0);
});
test('walk-in mobile validation rejects malformed supplied numbers', async t => {
  setup(t);
  const res = response();
  await walkinSale(req({ phone: '1234567890', cashTenderedPaise: 14000 }), res);
  assert.equal(res.body.error.code, 'INVALID_PHONE');
});
test('paused cash sales cannot be bypassed by calling the payment API', async t => {
  setup(t, { cashSalesEnabled: false });
  const res = response();
  await walkinSale(req({ cashTenderedPaise: 14000 }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error.code, 'SALES_CLOSED');
});
test('expired token lookup is rejected without changing the token', async t => {
  setup(t);
  t.mock.method(CashToken, 'findOne', async () => ({ expiresAt: new Date(Date.now() - 1) }));
  const res = response();
  await lookupToken(req(), res);
  assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
});
test('token confirmation claims only an open unexpired token within its transaction', async t => {
  setup(t);
  const session = { testSession: true };
  t.mock.method(mongoose.connection, 'transaction', async callback => callback(session));
  t.mock.method(CashToken, 'findOneAndUpdate', async (filter, update, options) => {
    assert.equal(filter.status, 'OPEN');
    assert.ok(filter.expiresAt.$gt instanceof Date);
    assert.equal(filter.tokenNo, 142);
    assert.equal(update.$set.status, 'PAID');
    assert.equal(options.session, session);
    return null;
  });
  const creates = t.mock.method(Order, 'create', () => { throw new Error('Must not create a duplicate'); });
  const res = response();
  await confirmTokenPayment(req({ cashTenderedPaise: 14000, expectedAmountPaise: 14000 }), res);
  assert.equal(res.body.error.code, 'TOKEN_UNAVAILABLE');
  assert.equal(creates.mock.callCount(), 0);
});
test('a token can pay for a named group: one ticket price per guest, one pass each', async t => {
  setup(t);
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  t.mock.method(CashToken, 'findOneAndUpdate', async () => ({ _id: 'token', holderName: 'Ananya', phone: '9876543210' }));
  let created;
  t.mock.method(Order, 'create', async ([order]) => { created = order; return [order]; });
  // Stop at pass issuing: only the order written for the group is under test here.
  t.mock.method(Order, 'findOne', () => ({ session: async () => null }));
  const underpaid = response();
  await confirmTokenPayment(req({ quantity: 3, cashTenderedPaise: 41999 }), underpaid);
  assert.equal(underpaid.body.error.code, 'INSUFFICIENT_CASH');
  await confirmTokenPayment(req({ quantity: 3, guestNames: ['', 'Rohit'], cashTenderedPaise: 42000, expectedAmountPaise: 42000 }), response());
  assert.equal(created.amountPaise, 42000);
  assert.equal(created.organizerSharePaise + created.platformFeePaise, 42000);
  assert.equal(created.isGroupBooking, true);
  assert.deepEqual(created.attendees.map(a => a.name), ['Ananya (1/3)', 'Rohit', 'Ananya (3/3)']);
  const tooMany = response();
  await confirmTokenPayment(req({ quantity: 50, cashTenderedPaise: 1000000 }), tooMany);
  assert.equal(tooMany.body.error.code, 'INVALID_QUANTITY');
});
test('a retried walk-in returns its existing receipt without another transaction', async t => {
  const existing = { orderId: 'CC-TESTSALE', status: 'PAID', paidAt: new Date(), amountPaise: 14000, cashTenderedPaise: 20000 };
  t.mock.method(Order, 'findOne', async () => existing);
  t.mock.method(Pass, 'find', () => ({ sort: async () => [{ _id: 'testpass', orderId: existing.orderId, qrNonce: 'nonce', holderName: 'Guest', phone: '0000000000' }] }));
  const tx = t.mock.method(mongoose.connection, 'transaction', () => { throw new Error('Must not issue twice'); });
  const res = response();
  await walkinSale(req({ requestId: '12345678-1234-5678', cashTenderedPaise: 20000 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.orderId, existing.orderId);
  assert.equal(res.body.data.changeRupees, '60.00');
  assert.equal(tx.mock.callCount(), 0);
});
test('undo refuses tickets used at the gate and expired undo windows', async t => {
  const session = {};
  t.mock.method(mongoose.connection, 'transaction', async callback => callback(session));
  let paidAt = new Date();
  t.mock.method(Order, 'findOne', () => ({ session: async () => ({ paidAt }) }));
  t.mock.method(Pass, 'find', () => ({ session: async () => [{ status: 'ACTIVE', presence: 'OUTSIDE', firstEntryDays: [1] }] }));
  const used = response();
  await undoLastConfirmation(req({ orderId: 'CC-TESTSALE' }), used);
  assert.equal(used.body.error.code, 'PASS_USED');
  paidAt = new Date(Date.now() - 31000);
  const expired = response();
  await undoLastConfirmation(req({ orderId: 'CC-TESTSALE' }), expired);
  assert.equal(expired.body.error.code, 'UNDO_EXPIRED');
});
test('counter summary covers the cashier open shift: paid cash sales since it opened', async t => {
  const request = req();
  const openedAt = new Date(Date.now() - 2 * 3600 * 1000);
  t.mock.method(Shift, 'findOneAndUpdate', async (filter) => {
    assert.equal(filter.cashierId, request.user._id);
    assert.equal(filter.status, 'OPEN');
    return { _id: 'shift-1', cashierId: request.user._id, openedAt, openingFloatPaise: 50000 };
  });
  t.mock.method(Order, 'aggregate', async pipeline => {
    const filter = pipeline[0].$match;
    assert.equal(filter.cashierId, request.user._id);
    assert.equal(filter.status, 'PAID');
    assert.deepEqual(filter.channel.$in, ['CASH_TOKEN', 'POS_WALKIN']);
    assert.equal(filter.paidAt.$gte, openedAt);
    return [{ salesPaise: 14000, ticketCount: 1 }];
  });
  t.mock.method(Order, 'find', () => ({ sort: () => ({ limit: n => { assert.equal(n, 5); return { select: async () => [] }; } }) }));
  const res = response();
  await getShiftSummary(request, res);
  assert.equal(res.body.data.totalCashRupees, '140.00');
  assert.equal(res.body.data.period, 'CURRENT_SHIFT');
  assert.equal(res.body.data.shift.expectedInDrawerPaise, 64000);
});
test('walk-in quantity must be a whole number within the per-sale limit', async t => {
  setup(t, { maxPassesPerPhone: 4 });
  const tx = t.mock.method(mongoose.connection, 'transaction', () => { throw new Error('Must not write'); });
  for (const quantity of [0, -1, 1.5, '2', 5]) {
    const res = response();
    await walkinSale(req({ quantity, cashTenderedPaise: 100000 }), res);
    assert.equal(res.body.error.code, 'INVALID_QUANTITY', `quantity ${quantity}`);
  }
  assert.equal(tx.mock.callCount(), 0);
});
test('a walk-in for four guests charges four tickets and issues one pass per guest', async t => {
  setup(t);
  const underpaid = response();
  await walkinSale(req({ quantity: 4, cashTenderedPaise: 55999 }), underpaid);
  assert.equal(underpaid.body.error.code, 'INSUFFICIENT_CASH');
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  let created;
  t.mock.method(Order, 'create', async ([order]) => { created = order; return [order]; });
  // Stop at pass issuing: only the order written for the group is under test here.
  t.mock.method(Order, 'findOne', () => ({ session: async () => null }));
  const res = response();
  await walkinSale(req({ name: 'Rahul', quantity: 4, cashTenderedPaise: 60000, expectedAmountPaise: 56000 }), res);
  assert.equal(created.amountPaise, 56000);
  assert.equal(created.organizerSharePaise + created.platformFeePaise, 56000);
  assert.equal(created.isGroupBooking, true);
  assert.deepEqual(created.attendees.map(a => a.name), ['Rahul (1/4)', 'Rahul (2/4)', 'Rahul (3/4)', 'Rahul (4/4)']);
  // Guests can be named one by one; anyone left blank keeps the buyer's label.
  await walkinSale(req({ name: 'Rahul', quantity: 4, guestNames: ['Rahul', ' Priya ', '', null], cashTenderedPaise: 60000, expectedAmountPaise: 56000 }), response());
  assert.deepEqual(created.attendees.map(a => a.name), ['Rahul', 'Priya', 'Rahul (3/4)', 'Rahul (4/4)']);
  const tooLong = response();
  await walkinSale(req({ name: 'Rahul', quantity: 2, guestNames: ['x'.repeat(61)], cashTenderedPaise: 60000 }), tooLong);
  assert.equal(tooLong.body.error.code, 'INVALID_NAME');
});
test('undo reverses every pass in a group sale, and refuses if any was used', async t => {
  const session = {};
  t.mock.method(mongoose.connection, 'transaction', async callback => callback(session));
  const order = { orderId: 'CC-TESTSALE', paidAt: new Date(), amountPaise: 56000, organizerSharePaise: 55000, platformFeePaise: 1000, save: async () => {} };
  t.mock.method(Order, 'findOne', () => ({ session: async () => order }));
  const fresh = () => Array.from({ length: 4 }, () => ({ status: 'ACTIVE', presence: 'OUTSIDE', save: async () => {} }));
  let passes = fresh();
  passes[2].presence = 'INSIDE';
  t.mock.method(Pass, 'find', filter => { assert.ok(filter.$or[1].orderId.test('CC-TESTSALE-P4')); assert.ok(!filter.$or[1].orderId.test('CC-TESTSALE-P4X')); return { session: async () => passes }; });
  const blocked = response();
  await undoLastConfirmation(req({ orderId: order.orderId }), blocked);
  assert.equal(blocked.body.error.code, 'PASS_USED');
  passes = fresh();
  t.mock.method(CashToken, 'updateOne', async () => ({}));
  const { LedgerEntry } = await import('../src/models/LedgerEntry.js');
  t.mock.method(LedgerEntry, 'create', async () => []);
  const sold = t.mock.method(Event, 'updateOne', async () => ({}));
  const res = response();
  await undoLastConfirmation(req({ orderId: order.orderId }), res);
  assert.equal(res.body.data.quantity, 4);
  assert.ok(passes.every(p => p.status === 'VOIDED'));
  assert.equal(sold.mock.calls[0].arguments[1].$inc['ticketTiers.$.soldCount'], -4);
});
const tieredEvent = { ticketTiers: [
  { tierId: 'general', name: 'General Comic Pass', pricePaise: 9900, platformFeePaise: 200, capacity: 2500, soldCount: 0, active: true },
  { tierId: 'vip', name: 'VIP Superfan Pass', pricePaise: 15000, platformFeePaise: 400, capacity: 300, soldCount: 298, badge: 'VIP_SUPERFAN', active: true },
  { tierId: 'old', name: 'Retired Pass', pricePaise: 1000, active: false }
] };
test('the counter sells every active ticket category, with General at the admin cash price', () => {
  const tiers = getCashTiers(settings, tieredEvent);
  assert.deepEqual(tiers.map(t => t.tierId), ['general', 'vip']);
  assert.equal(tiers[0].amountPaise, 14000);
  assert.equal(tiers[1].amountPaise, 15400);
  assert.equal(tiers[1].remaining, 2);
  assert.equal(getCashTiers({ ...settings, cashPriceMode: 'ORGANIZER_ABSORBS_FEE' }, tieredEvent)[1].amountPaise, 15000);
  assert.deepEqual(getCashTiers(settings, null).map(t => t.tierId), ['general']);
});
test('a walk-in is priced and recorded under the chosen category, within what is left', async t => {
  t.mock.method(AdminSettings, 'getSettings', async () => settings);
  t.mock.method(Event, 'findOne', async () => tieredEvent);
  const unknown = response();
  await walkinSale(req({ tierId: 'backstage', cashTenderedPaise: 100000 }), unknown);
  assert.equal(unknown.body.error.code, 'INVALID_TIER');
  const soldOut = response();
  await walkinSale(req({ tierId: 'vip', quantity: 3, cashTenderedPaise: 100000 }), soldOut);
  assert.equal(soldOut.body.error.code, 'SOLD_OUT');
  const underpaid = response();
  await walkinSale(req({ tierId: 'vip', quantity: 2, cashTenderedPaise: 30000 }), underpaid);
  assert.equal(underpaid.body.error.code, 'INSUFFICIENT_CASH');
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  let created;
  t.mock.method(Order, 'create', async ([order]) => { created = order; return [order]; });
  t.mock.method(Order, 'findOne', () => ({ session: async () => null }));
  await walkinSale(req({ tierId: 'vip', quantity: 2, cashTenderedPaise: 30800, expectedAmountPaise: 30800 }), response());
  assert.equal(created.tierId, 'vip');
  assert.equal(created.tierName, 'VIP Superfan Pass');
  assert.equal(created.amountPaise, 30800);
  assert.ok(created.attendees.every(a => a.tierId === 'vip'));
});
const merchEvent = { addOns: [
  { addOnId: 'tshirt', name: 'Festival T-Shirt', pricePaise: 29900, inventory: 10, soldCount: 7, variants: ['S', 'M', 'L'], active: true },
  { addOnId: 'parking', name: 'Parking', pricePaise: 5000, inventory: 500, soldCount: 0, category: 'PARKING', active: true },
  { addOnId: 'retired', name: 'Old Mug', pricePaise: 100, active: false }
] };
test('extras are priced from the event, need a size when they have sizes, and respect stock', () => {
  const { addOns, totalPaise } = priceCashAddOns(merchEvent, [{ addOnId: 'tshirt', variant: 'M', quantity: 2 }, { addOnId: 'tshirt', variant: 'L', quantity: 1 }, { addOnId: 'parking', quantity: 1 }]);
  assert.equal(totalPaise, 29900 * 3 + 5000);
  assert.deepEqual(addOns.map(a => a.variant), ['M', 'L', undefined]);
  assert.throws(() => priceCashAddOns(merchEvent, [{ addOnId: 'tshirt', quantity: 1 }]), { code: 'INVALID_ADDONS' });
  assert.throws(() => priceCashAddOns(merchEvent, [{ addOnId: 'tshirt', variant: 'XL', quantity: 1 }]), { code: 'INVALID_ADDONS' });
  assert.throws(() => priceCashAddOns(merchEvent, [{ addOnId: 'retired', quantity: 1 }]), { code: 'INVALID_ADDONS' });
  assert.throws(() => priceCashAddOns(merchEvent, [{ addOnId: 'parking', quantity: 0 }]), { code: 'INVALID_ADDONS' });
  assert.throws(() => priceCashAddOns(merchEvent, [{ addOnId: 'tshirt', variant: 'S', quantity: 2 }, { addOnId: 'tshirt', variant: 'M', quantity: 2 }]), { code: 'ADDON_SOLD_OUT' });
  assert.equal(priceCashAddOns(merchEvent).totalPaise, 0);
});
test('a walk-in with extras charges them on top and gives them to the organizer', async t => {
  t.mock.method(AdminSettings, 'getSettings', async () => settings);
  t.mock.method(Event, 'findOne', async () => merchEvent);
  const extras = [{ addOnId: 'tshirt', variant: 'M', quantity: 1 }];
  const underpaid = response();
  await walkinSale(req({ addOns: extras, cashTenderedPaise: 14000 }), underpaid);
  assert.equal(underpaid.body.error.code, 'INSUFFICIENT_CASH');
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  let created;
  t.mock.method(Order, 'create', async ([order]) => { created = order; return [order]; });
  t.mock.method(Order, 'findOne', () => ({ session: async () => null }));
  await walkinSale(req({ addOns: extras, cashTenderedPaise: 50000, expectedAmountPaise: 43900 }), response());
  assert.equal(created.amountPaise, 43900);
  assert.equal(created.organizerSharePaise, 13750 + 29900);
  assert.equal(created.platformFeePaise, 250);
  assert.equal(created.addOns[0].variant, 'M');
});
test('undo refuses a sale whose extra was already handed over', async t => {
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  t.mock.method(Order, 'findOne', () => ({ session: async () => ({ paidAt: new Date(), addOns: [{ addOnId: 'tshirt', claimed: true }] }) }));
  const pass = t.mock.method(Pass, 'find', () => { throw new Error('Must not void passes'); });
  const res = response();
  await undoLastConfirmation(req({ orderId: 'CC-TESTSALE' }), res);
  assert.equal(res.body.error.code, 'ADDON_CLAIMED');
  assert.equal(pass.mock.callCount(), 0);
});
test('the counter sells for the cashier\'s own event, at that event\'s price', async t => {
  setup(t);
  t.mock.method(Event, 'findOne', async filter => {
    assert.equal(filter.eventId, 'kolkata-7');
    return { eventId: 'kolkata-7', name: 'Kolkata 7.0', status: 'ACTIVE', basePricePaise: 5000, platformFeePaise: 100 };
  });
  t.mock.method(mongoose.connection, 'transaction', async callback => callback({}));
  let created;
  t.mock.method(Order, 'create', async ([order]) => { created = order; return [order]; });
  t.mock.method(Order, 'findOne', () => ({ session: async () => null }));
  const request = req({ cashTenderedPaise: 5100, expectedAmountPaise: 5100 });
  request.user.assignedEventId = 'kolkata-7';
  await walkinSale(request, response());
  assert.equal(created.eventId, 'kolkata-7');
  assert.equal(created.amountPaise, 5100);
});
test('the counter refuses to sell when its event is gone or archived, or the event is unclear', async t => {
  setup(t);
  const tx = t.mock.method(mongoose.connection, 'transaction', () => { throw new Error('Must not write'); });
  for (const event of [null, { eventId: 'test-event', status: 'ARCHIVED' }]) {
    t.mock.method(Event, 'findOne', async () => event);
    const res = response();
    await walkinSale(req({ cashTenderedPaise: 14000 }), res);
    assert.equal(res.body.error.code, 'NO_EVENT');
  }
  // An account with no event of its own sells only while exactly one event is on sale.
  for (const events of [[], [{ eventId: 'a' }, { eventId: 'b' }]]) {
    t.mock.method(Event, 'find', () => ({ limit: async () => events }));
    const request = req({ cashTenderedPaise: 14000 });
    delete request.user.assignedEventId;
    const res = response();
    await walkinSale(request, res);
    assert.equal(res.body.error.code, 'NO_EVENT');
  }
  assert.equal(tx.mock.callCount(), 0);
});
test('a token is looked up only among the counter\'s own event', async t => {
  setup(t);
  t.mock.method(CashToken, 'findOne', async filter => { assert.equal(filter.eventId, 'test-event'); return null; });
  const res = response();
  await lookupToken(req(), res);
  assert.equal(res.body.error.code, 'TOKEN_NOT_FOUND');
});
