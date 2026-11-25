import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createOrder } from '../src/controllers/order.controller.js';
import { AdminSettings } from '../src/models/AdminSettings.js';
import { Event } from '../src/models/Event.js';

const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const guest = (name, phone = '9876543210', email = 'guest@example.com') => ({ name, phone, email });
const order = async body => {
  const res = response();
  await createOrder({ body: { name: 'Rahul Das', phone: '9876543210', email: 'rahul@example.com', ...body } }, res);
  return res;
};
afterEach(() => test.mock.restoreAll());

test('a group booking is refused before any lookup when a guest name or mobile is missing or bad', async t => {
  // Bad input must be turned away before the order touches settings or the database.
  const lookups = t.mock.method(AdminSettings, 'getSettings', async () => { throw new Error('Must not be reached'); });
  const cases = [
    [{ attendees: [guest('Rahul Das'), {}] }, 'INVALID_NAME'],
    [{ attendees: [guest('Rahul Das'), guest('   ')] }, 'INVALID_NAME'],
    [{ attendees: [guest('Rahul Das'), guest('x'.repeat(61))] }, 'INVALID_NAME'],
    [{ attendees: [guest('Rahul Das'), guest(42)] }, 'INVALID_NAME'],
    [{ attendees: [guest('Rahul Das'), guest('Priya Sen', '12345')] }, 'INVALID_PHONE'],
    [{ attendees: [guest('Rahul Das'), { name: 'Priya Sen' }] }, 'INVALID_PHONE'],
    [{ attendees: Array.from({ length: 9 }, () => guest('Rahul Das')) }, 'INVALID_QUANTITY'],
    [{ attendees: [] }, 'INVALID_QUANTITY'],
    [{ attendees: 'everyone' }, 'INVALID_QUANTITY']
  ];
  for (const [body, code] of cases) {
    const res = await order({ isGroupBooking: true, ...body });
    assert.equal(res.statusCode, 400, code);
    assert.equal(res.body.error.code, code);
  }
  const longLead = await order({ name: 'x'.repeat(61) });
  assert.equal(longLead.body.error.code, 'INVALID_NAME');
  const numberLead = await order({ name: 12345 });
  assert.equal(numberLead.body.error.code, 'INVALID_NAME');
  assert.equal(lookups.mock.callCount(), 0);
});

test('an order must name an event that exists; there is no default event', async t => {
  t.mock.method(Event, 'findOne', async () => null);
  const settings = t.mock.method(AdminSettings, 'getSettings', async () => { throw new Error('Must not be reached'); });
  for (const eventId of [undefined, '', 'comics-carnival']) {
    const res = await order({ eventId });
    assert.equal(res.body.error.code, 'EVENT_NOT_FOUND', String(eventId));
  }
  assert.equal(settings.mock.callCount(), 0);
});

test('a valid group of eight passes the guest checks', async t => {
  // Reaching the event lookup means every guest check passed; stop the order there.
  const lookups = t.mock.method(Event, 'findOne', async () => { throw new Error('stop here'); });
  const res = await order({ eventId: 'rock-night', isGroupBooking: true, attendees: Array.from({ length: 8 }, (_, i) => guest(`Guest ${i + 1}`, '+91 98765-43210')) });
  assert.equal(lookups.mock.callCount(), 1);
  assert.notEqual(res.body?.error?.code, 'INVALID_NAME');
  assert.notEqual(res.body?.error?.code, 'INVALID_PHONE');
});
