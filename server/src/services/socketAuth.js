import { findSession, readSessionToken } from './session.service.js';
import { User } from '../models/User.js';
import { ROLES } from '../constants/index.js';

/**
 * Socket.IO access rules.
 *
 * Staff are recognised by their session cookie and put in role rooms:
 *   staff:admin  revenue figures, new sponsor/stall inquiries (admins, organizers)
 *   staff:gate   live gate counts (gate staff, admins, organizers)
 *   session:<id> so ending a session drops its live connection
 * Everyone else is a public connection (attendees), which may only follow its
 * own order or cash token and still gets evacuation alerts and announcements.
 */
export function configureSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const session = await findSession(readSessionToken({ headers: socket.handshake.headers }));
      if (session) {
        const user = await User.findById(session.userId).select('role active').lean();
        if (user?.active) {
          socket.data.role = user.role;
          socket.join(`session:${session._id}`);
          if ([ROLES.SUPER_ADMIN, ROLES.EVENT_ADMIN].includes(user.role)) socket.join(['staff:admin', 'staff:gate']);
          if (user.role === ROLES.GATE) socket.join('staff:gate');
        }
      }
    } catch { /* treat as a public connection */ }
    next();
  });

  io.on('connection', (socket) => {
    // Only an order or cash token room can be joined on request, never a staff room
    socket.on('join', (room) => {
      if (typeof room === 'string' && /^(order|token):[\w-]{1,64}$/.test(room)) socket.join(room);
    });
  });
}
