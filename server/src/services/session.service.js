import crypto from 'crypto';
import { Session } from '../models/Session.js';
import { ROLES } from '../constants/index.js';
import { getSocketInstance } from './socket.service.js';

/*
 * Staff sessions.
 *
 * Login creates a random token. The browser keeps it in an HttpOnly cookie
 * (page scripts can't read it, so an XSS bug can't steal it); the database keeps
 * only its SHA-256 hash. Every request looks the session up, so ending a session
 * takes effect immediately on every device.
 *
 * Lifetimes per role: admins and organizers have shorter sessions than gate and
 * box office staff, who work long event days.
 */
export const SESSION_COOKIE = 'fp_session';

const HOUR = 60 * 60 * 1000;
const LIFETIMES = {
  [ROLES.SUPER_ADMIN]: { absolute: 12 * HOUR, idle: 2 * HOUR },
  [ROLES.EVENT_ADMIN]: { absolute: 12 * HOUR, idle: 2 * HOUR },
  [ROLES.CASHIER]: { absolute: 16 * HOUR, idle: 4 * HOUR },
  [ROLES.GATE]: { absolute: 16 * HOUR, idle: 4 * HOUR }
};
const lifetimeFor = (role) => LIFETIMES[role] || { absolute: 8 * HOUR, idle: 2 * HOUR };
const TOUCH_EVERY_MS = 60 * 1000;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function describeDevice(ua = '') {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone/iPad'
    : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

/** Reads the session token from the cookie (browsers) or a Bearer header (scripts). */
export function readSessionToken(req) {
  const cookieHeader = req.headers?.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  const auth = req.headers?.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

export async function createSession(user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const { absolute, idle } = lifetimeFor(user.role);
  const session = await Session.create({
    userId: user._id,
    role: user.role,
    tokenHash: hash(token),
    device: describeDevice(req.headers?.['user-agent']),
    ip: req.ip,
    idleTimeoutMs: idle,
    expiresAt: new Date(Date.now() + absolute)
  });
  return { token, session };
}

/** The live session for a token, or null if unknown, ended, expired or idle too long. */
export async function findSession(token) {
  if (!token || token.length > 200) return null;
  const session = await Session.findOne({ tokenHash: hash(token), revokedAt: null });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > session.idleTimeoutMs) {
    await endSession(session._id, 'Idle timeout');
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    session.lastSeenAt = new Date(now);
    Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: session.lastSeenAt } }).catch(() => {});
  }
  return session;
}

// Live connections (gate/admin screens) of an ended session are dropped too
function disconnectSockets(sessionIds) {
  const io = getSocketInstance();
  if (!io) return;
  for (const id of sessionIds) io.in(`session:${id}`).disconnectSockets(true);
}

export async function endSession(sessionId, reason) {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  disconnectSockets([sessionId]);
}

/** Ends every session of a user, optionally keeping one (the device making the change). */
export async function endUserSessions(userId, reason, keepSessionId = null) {
  const filter = { userId, revokedAt: null, ...(keepSessionId ? { _id: { $ne: keepSessionId } } : {}) };
  const ids = (await Session.find(filter).select('_id').lean()).map(s => s._id);
  if (!ids.length) return 0;
  await Session.updateMany({ _id: { $in: ids } }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  disconnectSockets(ids);
  return ids.length;
}

export async function activeSessionsOf(userIds) {
  return Session.find({ userId: { $in: userIds }, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 }).lean();
}

// Secure (HTTPS-only) whenever the visitor is on HTTPS, including behind nginx,
// which reports it in X-Forwarded-Proto. On a plain-http site the cookie is sent
// without Secure so staff can still log in; turn HTTPS on for the live site.
const isHttps = (req) =>
  Boolean(req?.secure) || String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

const cookieOptions = (req, maxAge) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: isHttps(req),
  path: '/',
  ...(maxAge !== undefined ? { maxAge } : {})
});

export function setSessionCookie(res, token, session) {
  res.cookie(SESSION_COOKIE, token, cookieOptions(res.req, session.expiresAt.getTime() - Date.now()));
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(res.req));
}
