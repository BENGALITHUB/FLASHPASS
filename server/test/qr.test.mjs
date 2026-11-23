// QR secret rotation keeps sold passes valid; reissued / forged QRs are refused at the gate.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';
import crypto from 'crypto';

const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { generateQRToken, verifyQRToken } = await imp('src/services/qr.service.js');
const { Pass } = await imp('src/models/Pass.js');
const { Event } = await imp('src/models/Event.js');
const { AdminSettings } = await imp('src/models/AdminSettings.js');
const { scanPass, helpdeskReissuePass } = await imp('src/controllers/gate.controller.js');

const OLD = 'old-secret-0123456789abcdef0123456789', NEW = 'new-secret-abcdef0123456789abcdef0123';
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };
const call = async (fn, body) => {
  let out;
  const res = { status() { return this; }, json(b) { out = b; return this; } };
  await fn({ body, query: {}, params: {}, user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } }, res);
  return out.data;
};

await t('secret is read from the environment at use time (not frozen at import)', async () => {
  process.env.QR_KEY_VERSION = 'CC1'; process.env.QR_HMAC_SECRET = OLD;
  const tok = generateQRToken('p1', 'n1');
  const expected = crypto.createHmac('sha256', OLD).update('CC1.p1.n1').digest('base64url').slice(0, 22);
  assert.equal(tok.split('.')[3], expected);
});

const oldToken = generateQRToken('p1', 'n1');
await t('after rotation, new QRs use CC2 and old CC1 QRs still verify', async () => {
  process.env.QR_KEY_VERSION = 'CC2'; process.env.QR_HMAC_SECRET = NEW;
  process.env.QR_KEY_VERSION_PREVIOUS = 'CC1'; process.env.QR_HMAC_SECRET_PREVIOUS = OLD;
  const fresh = generateQRToken('p1', 'n1');
  assert.ok(fresh.startsWith('CC2.'));
  assert.equal(verifyQRToken(fresh).valid, true);
  assert.equal(verifyQRToken(oldToken).valid, true);
});
await t('without the previous key, old QRs fail; a wrong signature fails', async () => {
  delete process.env.QR_HMAC_SECRET_PREVIOUS;
  assert.equal(verifyQRToken(oldToken).valid, false);
  assert.equal(verifyQRToken(generateQRToken('p1', 'n1').slice(0, -2) + 'zz').valid, false);
});

await t('gate: a reissued pass\'s old QR is refused, the new one gets in', async () => {
  const s = await AdminSettings.getSettings();
  s.eventDays = [{ day: 1, date: '2099-01-01', label: 'Day 1' }]; await s.save();
  await Event.create({ eventId: 'comics-carnival', name: 'CC', venue: 'V', basePricePaise: 5000, platformFeePaise: 200, reentryMode: 'WRISTBAND' });
  const pass = await Pass.create({ orderId: 'CC-QR1', holderName: 'Fan', phone: '9800000000', badge: '3-DAY', validDays: [1, 2, 3] });
  const before = generateQRToken(pass._id.toString(), pass.qrNonce);
  const re = await call(helpdeskReissuePass, { passId: pass._id });
  assert.ok(re.pass.newQrToken);
  assert.equal((await call(scanPass, { qrToken: before })).result, 'INVALID_QR');
  assert.equal((await call(scanPass, { qrToken: re.pass.newQrToken })).result, 'ENTRY_OK');
});
await t('gate: a correctly signed QR with a made-up nonce is refused', async () => {
  const pass = await Pass.create({ orderId: 'CC-QR2', holderName: 'Fan 2', phone: '9800000001', badge: '3-DAY', validDays: [1, 2, 3] });
  const forged = generateQRToken(pass._id.toString(), 'guessed-nonce');
  assert.equal((await call(scanPass, { qrToken: forged })).result, 'INVALID_QR');
});

console.log(`\n${passed} checks passed`);
await mongoose.disconnect();
await mongod.stop();
