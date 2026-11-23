// Staff sessions over real HTTP + Socket.IO: cookie login, logout, revocation, idle
// timeout, force logout, export without URL tokens, staff-only live updates.
// In-memory MongoDB only.
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert/strict';
import http from 'http';
import bcrypt from 'bcryptjs';

const SERVER = new URL('../', import.meta.url);
const imp = (p) => import(new URL(p, SERVER).href);
const mongod = await MongoMemoryServer.create();
const { default: mongoose } = await imp('node_modules/mongoose/index.js');
await mongoose.connect(mongod.getUri());

const { default: app } = await imp('src/app.js');
const { Server } = await imp('node_modules/socket.io/wrapper.mjs');
const { setSocketInstance, emitAdminMetrics, emitGateStats } = await imp('src/services/socket.service.js');
const { configureSocketAuth } = await imp('src/services/socketAuth.js');
const { User } = await imp('src/models/User.js');
const { Session } = await imp('src/models/Session.js');
const { io: ioClient } = await import(new URL('../../client/node_modules/socket.io-client/build/esm-debug/index.js', import.meta.url).href)
  .catch(() => import(new URL('../../client/node_modules/socket.io-client/build/esm/index.js', import.meta.url).href));

const httpServer = http.createServer(app);
const io = new Server(httpServer);
setSocketInstance(io);
configureSocketAuth(io);
await new Promise(r => httpServer.listen(0, r));
const BASE = `http://localhost:${httpServer.address().port}`;

const mk = async (username, role, pin, extra = {}) => User.create({ username, name: username, role, pinHash: await bcrypt.hash(pin, 4), active: true, assignedEventId: 'comics-carnival', ...extra });
await mk('boss', 'SUPER_ADMIN', '482915');
await mk('rina', 'CASHIER', '730418');
await mk('gatey', 'GATE_VOLUNTEER', '581734');

const login = async (username, pin) => {
  const r = await fetch(`${BASE}/api/v1/auth/staff-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, pin }) });
  const body = await r.json();
  const setCookie = r.headers.get('set-cookie') || '';
  return { status: r.status, body, setCookie, cookie: setCookie.split(';')[0] };
};
const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const post = (path, cookie, body = {}, pin) => fetch(`${BASE}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(pin ? { 'x-admin-pin': pin } : {}) }, body: JSON.stringify(body)
});

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('  ✔', name); };

const boss = await login('boss', '482915');
await t('login sets an HttpOnly, SameSite=Strict session cookie and returns no token', async () => {
  assert.equal(boss.status, 200);
  assert.match(boss.setCookie, /^fp_session=/);
  assert.match(boss.setCookie, /HttpOnly/i);
  assert.match(boss.setCookie, /SameSite=Strict/i);
  assert.equal(boss.body.data.token, undefined);
  assert.equal(boss.body.data.user.username, 'boss');
});
await t('cookie is Secure on HTTPS (also behind nginx), still works on plain http', async () => {
  assert.doesNotMatch(boss.setCookie, /;\s*Secure/i, 'plain http: no Secure flag, login still sticks');
  const r = await fetch(`${BASE}/api/v1/auth/staff-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ username: 'boss', pin: '482915' })
  });
  assert.match(r.headers.get('set-cookie') || '', /;\s*Secure/i, 'https via proxy: Secure flag set');
});
await t('the cookie opens staff pages; no cookie or a URL token does not', async () => {
  assert.equal((await get('/api/v1/auth/me', boss.cookie)).status, 200);
  assert.equal((await get('/api/v1/auth/me')).status, 401);
  const token = boss.cookie.split('=')[1];
  assert.equal((await get(`/api/v1/admin/metrics?token=${token}`)).status, 401);
});
await t('CSV export works with the cookie (no token in the URL)', async () => {
  const r = await get('/api/v1/admin/export/passes', boss.cookie);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
});
await t('logout ends the session on the server', async () => {
  const s = await login('rina', '730418');
  assert.equal((await get('/api/v1/auth/me', s.cookie)).status, 200);
  const out = await post('/api/v1/auth/logout', s.cookie);
  assert.match(out.headers.get('set-cookie') || '', /fp_session=;/);
  assert.equal((await get('/api/v1/auth/me', s.cookie)).status, 401, 'old cookie no longer works');
});
await t('PIN reset logs the person out on every device; the admin stays logged in', async () => {
  const phone = await login('rina', '730418');
  const laptop = await login('rina', '730418');
  const rina = await User.findOne({ username: 'rina' });
  const r = await post(`/api/v1/admin/users/${rina._id}/pin`, boss.cookie, { newPin: '904726' }, '482915');
  assert.equal(r.status, 200, await r.text());
  assert.equal((await get('/api/v1/auth/me', phone.cookie)).status, 401);
  assert.equal((await get('/api/v1/auth/me', laptop.cookie)).status, 401);
  assert.equal((await get('/api/v1/auth/me', boss.cookie)).status, 200);
});
await t('switching an account off ends its sessions', async () => {
  const s = await login('gatey', '581734');
  const gatey = await User.findOne({ username: 'gatey' });
  assert.equal((await post(`/api/v1/admin/users/${gatey._id}/active`, boss.cookie, { active: false }, '482915')).status, 200);
  assert.equal((await get('/api/v1/auth/me', s.cookie)).status, 401);
  await post(`/api/v1/admin/users/${gatey._id}/active`, boss.cookie, { active: true }, '482915');
});
await t('admin sees devices and can log one out, or all', async () => {
  const a = await login('gatey', '581734');
  const b = await login('gatey', '581734');
  const gatey = await User.findOne({ username: 'gatey' });
  const list = await (await get(`/api/v1/admin/users/${gatey._id}/sessions`, boss.cookie)).json();
  assert.equal(list.data.sessions.length, 2);
  const users = await (await get('/api/v1/admin/users', boss.cookie)).json();
  assert.equal(users.data.find(u => u.username === 'gatey').activeSessions, 2);
  assert.equal((await post(`/api/v1/admin/sessions/${list.data.sessions[0].id}/end`, boss.cookie)).status, 200);
  const stillIn = [(await get('/api/v1/auth/me', a.cookie)).status, (await get('/api/v1/auth/me', b.cookie)).status].sort();
  assert.deepEqual(stillIn, [200, 401], 'exactly one device logged out');
  assert.equal((await post(`/api/v1/admin/users/${gatey._id}/sessions/end-all`, boss.cookie)).status, 200);
  assert.equal((await get('/api/v1/auth/me', a.cookie)).status, 401);
  assert.equal((await get('/api/v1/auth/me', b.cookie)).status, 401);
});
await t('sessions end after being idle too long (gate: 4 h)', async () => {
  const s = await login('gatey', '581734');
  await Session.updateMany({ revokedAt: null, role: 'GATE_VOLUNTEER' }, { $set: { lastSeenAt: new Date(Date.now() - 5 * 3600 * 1000) } });
  assert.equal((await get('/api/v1/auth/me', s.cookie)).status, 401);
});
await t('admin sessions are shorter than gate sessions', async () => {
  const g = await login('gatey', '581734');
  const adminS = await Session.findOne({ role: 'SUPER_ADMIN', revokedAt: null });
  const gateS = await Session.findOne({ role: 'GATE_VOLUNTEER', revokedAt: null });
  assert.ok(adminS.expiresAt - adminS.createdAt < gateS.expiresAt - gateS.createdAt);
  assert.ok(g.cookie);
});

// ---- Live updates ----
const connect = (cookie) => new Promise((resolve, reject) => {
  const s = ioClient(BASE, { transports: ['websocket'], extraHeaders: cookie ? { Cookie: cookie } : {}, forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const received = (socket, event, ms = 600) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(false), ms);
  socket.once(event, () => { clearTimeout(timer); resolve(true); });
});

await t('revenue updates reach admins only, not the public', async () => {
  const pub = await connect();
  const adm = await connect(boss.cookie);
  await new Promise(r => setTimeout(r, 200));
  const [pubGot, admGot] = await Promise.all([received(pub, 'admin:metrics'), received(adm, 'admin:metrics'), (async () => { await new Promise(r => setTimeout(r, 100)); emitAdminMetrics({ gross: 1 }); })()]);
  assert.equal(pubGot, false);
  assert.equal(admGot, true);
  pub.close(); adm.close();
});
await t('a public connection cannot join a staff room', async () => {
  const pub = await connect();
  pub.emit('join', 'staff:gate');
  await new Promise(r => setTimeout(r, 200));
  const got = received(pub, 'gate:stats');
  emitGateStats({ insideNow: 1 });
  assert.equal(await got, false);
  pub.close();
});
await t('ending a session drops its live connection', async () => {
  const s = await login('gatey', '581734');
  const sock = await connect(s.cookie);
  const dropped = new Promise(r => sock.once('disconnect', () => r(true)));
  await post('/api/v1/auth/logout', s.cookie);
  assert.equal(await Promise.race([dropped, new Promise(r => setTimeout(() => r(false), 2000))]), true);
  sock.close();
});

console.log(`\n${passed} checks passed`);
io.close();
httpServer.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(0);
