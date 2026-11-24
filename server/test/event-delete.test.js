import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { deleteEvent, setEventArchived } from '../src/controllers/admin.controller.js';
import { Event } from '../src/models/Event.js';
import { Order } from '../src/models/Order.js';
import { Pass } from '../src/models/Pass.js';
import { LedgerEntry } from '../src/models/LedgerEntry.js';
import { Payout } from '../src/models/Payout.js';
import { SettlementRequest } from '../src/models/SettlementRequest.js';
import { User } from '../src/models/User.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Session } from '../src/models/Session.js';

const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const req = (eventId, body = {}) => ({ params: { eventId }, body, user: { _id: new mongoose.Types.ObjectId(), username: 'admin', role: 'SUPER_ADMIN' } });
const records = [Order, Pass, LedgerEntry, Payout, SettlementRequest];
function setup(t, { event, withRecordIn = null } = {}) {
  t.mock.method(Event, 'findOne', async () => event);
  for (const model of records) t.mock.method(model, 'exists', async () => (model === withRecordIn ? { _id: 'x' } : null));
  t.mock.method(AuditLog, 'create', async () => ({}));
  t.mock.method(Session, 'updateMany', async () => ({ modifiedCount: 0 }));
  t.mock.method(Session, 'find', () => ({ select: () => ({ lean: async () => [] }), lean: async () => [] }));
  return { removed: t.mock.method(Event, 'deleteOne', async () => ({ deletedCount: 1 })) };
}
afterEach(() => test.mock.restoreAll());

test('the main event can be neither deleted nor archived', async t => {
  const { removed } = setup(t, { event: { eventId: 'comics-carnival' } });
  const res = response();
  await deleteEvent(req('comics-carnival', { confirmEventId: 'comics-carnival' }), res);
  assert.equal(res.body.error.code, 'DEFAULT_EVENT');
  const archived = response();
  await setEventArchived(req('Comics-Carnival'), archived);
  assert.equal(archived.body.error.code, 'DEFAULT_EVENT');
  assert.equal(removed.mock.callCount(), 0);
});

test('deleting needs the event ID typed back', async t => {
  const { removed } = setup(t, { event: { _id: 'e1', eventId: 'rock-night', name: 'Rock Night' } });
  const res = response();
  await deleteEvent(req('rock-night', { confirmEventId: 'rock' }), res);
  assert.equal(res.body.error.code, 'CONFIRMATION_MISMATCH');
  assert.equal(removed.mock.callCount(), 0);
});

test('an event with any order, pass or settlement record is kept', async t => {
  for (const model of records) {
    const { removed } = setup(t, { event: { _id: 'e1', eventId: 'rock-night', name: 'Rock Night' }, withRecordIn: model });
    const res = response();
    await deleteEvent(req('rock-night', { confirmEventId: 'rock-night' }), res);
    assert.equal(res.statusCode, 409, model.modelName);
    assert.equal(res.body.error.code, 'EVENT_HAS_SALES');
    assert.equal(removed.mock.callCount(), 0);
    test.mock.restoreAll();
  }
});

test('an event with no sales is deleted and its staff are switched off', async t => {
  const { removed } = setup(t, { event: { _id: 'e1', eventId: 'rock-night', name: 'Rock Night' } });
  const staff = [{ _id: new mongoose.Types.ObjectId(), active: true, assignedEventId: 'rock-night', save: async () => {} }];
  t.mock.method(User, 'find', async filter => { assert.equal(filter.assignedEventId, 'rock-night'); return staff; });
  const res = response();
  await deleteEvent(req('rock-night', { confirmEventId: 'Rock-Night ' }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(removed.mock.callCount(), 1);
  assert.equal(staff[0].active, false);
  assert.equal(staff[0].assignedEventId, 'rock-night');
  assert.equal(res.body.data.staffSwitchedOff, 1);
});

test('archiving hides the event and stops both sales; restoring leaves sales off', async t => {
  const event = { eventId: 'rock-night', name: 'Rock Night', status: 'ACTIVE', onlineSalesEnabled: true, cashSalesEnabled: true, save: async () => {} };
  setup(t, { event });
  await setEventArchived(req('rock-night', { archived: true }), response());
  assert.deepEqual([event.status, event.onlineSalesEnabled, event.cashSalesEnabled], ['ARCHIVED', false, false]);
  await setEventArchived(req('rock-night', { archived: false }), response());
  assert.deepEqual([event.status, event.onlineSalesEnabled, event.cashSalesEnabled], ['ACTIVE', false, false]);
});
