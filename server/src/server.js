import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './config/db.js';
import { seedDatabase } from './config/seed.js';
import { setSocketInstance } from './services/socket.service.js';
import { startReconciliationJob } from './services/reconcile.service.js';
import { warnIfDemoPins } from './controllers/staff.controller.js';
import { configureSocketAuth } from './services/socketAuth.js';

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

// Socket.io initialization
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true
  }
});

setSocketInstance(io);

// Who may receive which live updates (see services/socketAuth.js)
configureSocketAuth(io);

// Global safety handlers to prevent abrupt process termination on transient network issues
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

// Start Server
// Secrets that are public (in .env.example or the code) must never run in production:
// a known QR secret helps forge passes. (Staff logins use server-side sessions, no secret.)
const PUBLIC_SECRETS = new Set([
  'super_secret_comic_con_hmac_key_2026_xyz123!',
  'super_secret_staff_jwt_key_comics_carnival_2026_jwt!'
]);
function checkSecrets() {
  const problems = [];
  for (const key of ['QR_HMAC_SECRET']) {
    const v = process.env[key] || '';
    if (!v) problems.push(`${key} is not set`);
    else if (PUBLIC_SECRETS.has(v)) problems.push(`${key} is the public example value`);
    else if (v.length < 32) problems.push(`${key} is shorter than 32 characters`);
  }
  if (!problems.length) return;
  const how = 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"';
  if (process.env.NODE_ENV === 'production') {
    console.error(`[SECURITY] Refusing to start: ${problems.join('; ')}.\n${how}`);
    process.exit(1);
  }
  console.warn(`[SECURITY] ${problems.join('; ')}. Fine for local testing, NOT for the live server. ${how}`);
}

const startServer = async () => {
  checkSecrets();
  await connectDB();
  await seedDatabase();
  startReconciliationJob();
  warnIfDemoPins().catch(() => {});

  httpServer.listen(PORT, () => {
    console.log(`[Comics Carnival Server] Running on http://localhost:${PORT}`);
  });
};

startServer();
