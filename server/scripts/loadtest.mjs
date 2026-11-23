/*
 * Gate scan load test (SRS NFR-PF-04 / AT-14).
 *
 *   npm run loadtest                 # 60 scans/s for 30 s
 *   npm run loadtest -- 120 20       # 120 scans/s for 20 s
 *
 * Fully self-contained and safe: it starts its own throwaway in-memory MongoDB
 * and its own server on a spare port, seeds passes there, fires scans with a
 * venue-like mix (new entries, screenshot re-use, fake QRs), prints latency
 * percentiles, checks no pass got in twice on the same day, and tears it all
 * down. It never touches the database in .env.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import mongoose from 'mongoose';

const [RATE = 60, SECONDS = 30] = process.argv.slice(2).map(Number);
const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/api/v1`;
const PASSES = Math.max(2000, Math.ceil(RATE * SECONDS * 1.1));
const QR_SECRET = 'loadtest-only-secret-0123456789abcdef';

console.log(`Load test: ${RATE} scans/s for ${SECONDS}s against a throwaway database`);
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = rs.getUri('loadtest');

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT,
  env: {
    ...process.env, MONGODB_URI: uri, PORT: String(PORT), NODE_ENV: 'production',
    RECONCILE_DISABLED: 'true', QR_HMAC_SECRET: QR_SECRET, JWT_SECRET: 'loadtest-jwt', DEFAULT_ADMIN_PIN: '123456'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
server.stdout.on('data', d => { log += d; });
server.stderr.on('data', d => { log += d; });
const cleanup = async () => { server.kill(); await mongoose.disconnect().catch(() => {}); await rs.stop(); };

try {
  for (let i = 0; i < 60 && !log.includes('Running on'); i++) await new Promise(r => setTimeout(r, 500));
  if (!log.includes('Running on')) throw new Error(`server did not start:\n${log}`);

  // Seed passes straight into the throwaway database
  process.env.QR_HMAC_SECRET = QR_SECRET;
  await mongoose.connect(uri);
  const { Pass } = await import('../src/models/Pass.js');
  const { generateQRToken } = await import('../src/services/qr.service.js');
  const docs = await Pass.insertMany(Array.from({ length: PASSES }, (_, i) => ({
    orderId: `CC-LT${String(i).padStart(6, '0')}`, eventId: 'comics-carnival', holderName: `Fan ${i}`,
    phone: '9800000000', badge: '3-DAY ALL ACCESS', validDays: [1, 2, 3]
  })));
  const tokens = docs.map(p => generateQRToken(p._id.toString(), p.qrNonce));

  // Log in like the gate phone does: the session comes back as a cookie
  const loginRes = await fetch(`${BASE}/auth/staff-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'gate1', pin: '222222' }) });
  const login = await loginRes.json();
  if (!login.ok) throw new Error(`gate login failed: ${JSON.stringify(login.error)}`);
  const sessionCookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie };

  let next = 0;
  const scanned = [];
  const results = [];
  const pick = () => {
    const r = Math.random();
    if (r < 0.05) return { qrToken: tokens[0].slice(0, -3) + 'xyz', kind: 'fake QR' };
    if (r < 0.15 && scanned.length > 20) return { qrToken: scanned[Math.floor(Math.random() * (scanned.length - 20))], kind: 'reused screenshot' };
    const t = tokens[next++ % tokens.length]; scanned.push(t); return { qrToken: t, kind: 'new entry' };
  };
  const scan = async () => {
    const { qrToken, kind } = pick();
    const gateId = `Gate ${1 + (results.length % 2)}`;
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}/gate/scan`, { method: 'POST', headers, body: JSON.stringify({ qrToken, mode: 'ENTRY', gateId, deviceId: gateId }) });
      const j = await res.json();
      results.push({ ms: performance.now() - t0, ok: res.ok, result: j.data?.result, server: j.data?.latencyMs, kind });
    } catch {
      results.push({ ms: performance.now() - t0, ok: false, result: 'NETWORK_ERROR', kind });
    }
  };

  const total = RATE * SECONDS;
  const pending = [];
  const start = performance.now();
  for (let i = 0; i < total; i++) {
    const wait = start + (i * 1000) / RATE - performance.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    pending.push(scan());
  }
  await Promise.all(pending);

  const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };
  const ms = results.map(r => r.ms);
  const srv = results.filter(r => r.server != null).map(r => r.server);
  const outcomes = {};
  for (const r of results) outcomes[`${r.kind} -> ${r.result}`] = (outcomes[`${r.kind} -> ${r.result}`] || 0) + 1;

  const dup = await mongoose.connection.collection('scanlogs').aggregate([
    { $match: { result: 'ENTRY_OK' } },
    { $group: { _id: { p: '$passId', d: '$eventDay' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }, { $count: 'n' }
  ]).toArray();

  const p95 = pct(ms, 95);
  console.log(`\nScans sent:        ${results.length} (${(results.length / ((performance.now() - start) / 1000)).toFixed(1)}/s)`);
  console.log(`Request errors:    ${results.filter(r => !r.ok).length}`);
  console.log(`End-to-end ms:     p50 ${pct(ms, 50)}  p95 ${p95}  p99 ${pct(ms, 99)}  max ${Math.round(Math.max(...ms))}`);
  console.log(`Server time ms:    p50 ${pct(srv, 50)}  p95 ${pct(srv, 95)}  p99 ${pct(srv, 99)}`);
  console.log('Outcomes:'); for (const [k, v] of Object.entries(outcomes)) console.log(`  ${k}: ${v}`);
  console.log(`Let in twice same day: ${dup[0]?.n || 0}`);
  console.log('\nNote: the database here is local. On the live server add the round trip to MongoDB Atlas (about 3 per scan).');

  const pass = p95 <= 500 && !(dup[0]?.n) && results.every(r => r.ok);
  console.log(pass ? '\nPASS: p95 within 500 ms, no double entries, no errors' : '\nFAIL: see numbers above');
  await cleanup();
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error(err);
  await cleanup();
  process.exit(1);
}
