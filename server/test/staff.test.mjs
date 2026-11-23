// Staff PIN reset, switch off, demo-PIN warning. In-memory MongoDB only.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';
import bcrypt from 'bcryptjs';

const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
delete process.env.DEFAULT_ADMIN_PIN;

const { User } = await imp('src/models/User.js');
const S = await imp('src/controllers/staff.controller.js');
const { staffLogin } = await imp('src/controllers/auth.controller.js');
const { createStaffUser } = await imp('src/controllers/admin.controller.js');

const mk = async (username, role, pin, extra = {}) => User.create({ username, name: username, role, pinHash: await bcrypt.hash(pin, 4), active: true, ...extra });
const admin = await mk('admin', 'SUPER_ADMIN', '123456');
const org = await mk('carnival_admin', 'EVENT_ADMIN', '333333', { assignedEventId: 'comics-carnival' });
const cashier = await mk('cashier1', 'CASHIER', '111111', { assignedEventId: 'comics-carnival' });
const otherGate = await mk('gate9', 'GATE_VOLUNTEER', '482915', { assignedEventId: 'anime-fest' });

const call = async (fn, user, { params = {}, body = {} } = {}) => {
  let out, code = 200;
  const res = { status(c) { code = c; return this; }, json(b) { out = b; return this; } };
  await fn({ user, params, body, query: {}, headers: {} }, res);
  return { code, data: out?.data, err: out?.error };
};

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

await t('demo accounts on published PINs are flagged', async () => {
  const r = await call(S.listDemoPinAccounts, admin);
  assert.deepEqual(r.data.accounts.map(a => a.username).sort(), ['admin', 'carnival_admin', 'cashier1']);
});
await t('organizer sees only accounts they manage', async () => {
  const r = await call(S.listDemoPinAccounts, org);
  assert.deepEqual(r.data.accounts.map(a => a.username).sort(), ['carnival_admin', 'cashier1']);
});
await t('weak PINs are refused', async () => {
  for (const p of ['111111', '123456', '654321', '345678', '12345', 'abcdef', '222222']) {
    const r = await call(S.resetStaffPin, admin, { params: { id: cashier._id }, body: { newPin: p } });
    assert.equal(r.code, 400, p);
  }
});
await t('admin resets cashier PIN; old PIN stops working, new one works, warning clears', async () => {
  const r = await call(S.resetStaffPin, admin, { params: { id: cashier._id }, body: { newPin: '730418' } });
  assert.equal(r.code, 200, JSON.stringify(r.err));
  assert.equal((await call(staffLogin, null, { body: { username: 'cashier1', pin: '111111' } })).code, 401);
  assert.equal((await call(staffLogin, null, { body: { username: 'cashier1', pin: '730418' } })).code, 200);
  const demo = await call(S.listDemoPinAccounts, admin);
  assert.ok(!demo.data.accounts.some(a => a.username === 'cashier1'));
});
await t('organizer cannot change the platform admin or another event\'s staff', async () => {
  assert.equal((await call(S.resetStaffPin, org, { params: { id: admin._id }, body: { newPin: '730419' } })).code, 403);
  assert.equal((await call(S.resetStaffPin, org, { params: { id: otherGate._id }, body: { newPin: '730419' } })).code, 403);
  assert.equal((await call(S.resetStaffPin, org, { params: { id: org._id }, body: { newPin: '581734' } })).code, 200, 'own PIN ok');
});
await t('switching an account off blocks login; you cannot switch yourself off', async () => {
  assert.equal((await call(S.setStaffActive, admin, { params: { id: admin._id }, body: { active: false } })).code, 403);
  assert.equal((await call(S.setStaffActive, org, { params: { id: cashier._id }, body: { active: false } })).code, 200);
  assert.equal((await call(staffLogin, null, { body: { username: 'cashier1', pin: '730418' } })).code, 401);
  await call(S.setStaffActive, org, { params: { id: cashier._id }, body: { active: true } });
  assert.equal((await call(staffLogin, null, { body: { username: 'cashier1', pin: '730418' } })).code, 200);
});
await t('new staff cannot be created with a weak PIN', async () => {
  const r = await call(createStaffUser, admin, { body: { username: 'gate5', name: 'Gate 5', pin: '000000', role: 'GATE_VOLUNTEER' } });
  assert.equal(r.code, 400);
  assert.equal(r.err.code, 'WEAK_PIN');
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
