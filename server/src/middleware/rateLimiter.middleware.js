import rateLimit from 'express-rate-limit';

/*
 * Rate limits.
 *
 * At the venue, hundreds of phones share one Wi-Fi (one public IP), and mobile
 * carriers put many users behind one IP too. So limits that protect a person
 * (orders, cash tokens, My Ticket) are counted per PHONE NUMBER, as the SRS
 * asks (FR-M1-10, FR-M3-03). Per-IP limits stay only as a wide cap against
 * scripted abuse, sized so a full venue on one IP never hits them.
 *
 * Behind a reverse proxy (nginx, cPanel), set TRUST_PROXY=1 so the real client
 * IP is used instead of the proxy's.
 */

const minutesLeft = (req) => Math.max(1, Math.ceil(((req.rateLimit?.resetTime?.getTime?.() || Date.now()) - Date.now()) / 60000));

const limiter = ({ windowMs, max, message, byPhone = false }) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  // Requests without a phone fall back to the IP
  keyGenerator: byPhone
    ? (req) => {
        const phone = String(req.body?.phone || req.body?.mobile || '').replace(/\D/g, '').slice(-10);
        return phone.length === 10 ? `phone:${phone}` : `ip:${req.ip}`;
      }
    : undefined,
  handler: (req, res) => res.status(429).json({
    ok: false,
    error: { code: 'RATE_LIMIT', message: `${message} Please try again in ${minutesLeft(req)} min.` }
  })
});

// Read-only public pages and polling (pass page, payment status every 2s, cash token every 3s)
export const generalLimiter = limiter({
  windowMs: 60 * 1000, max: 600, message: 'Too many requests from this network.'
});

// Online orders: 5 per phone per 10 min (SRS), wide cap per IP
export const orderCreationLimiter = [
  limiter({ windowMs: 10 * 60 * 1000, max: 300, message: 'Too many orders from this network.' }),
  limiter({ windowMs: 10 * 60 * 1000, max: 5, byPhone: true, message: 'Too many order attempts for this mobile number.' })
];

// My Ticket lookup: 10 per phone per hour (SRS), wide cap per IP for the help desk / venue Wi-Fi
export const myTicketLimiter = [
  limiter({ windowMs: 10 * 60 * 1000, max: 100, message: 'Too many lookups from this network.' }),
  limiter({ windowMs: 60 * 60 * 1000, max: 10, byPhone: true, message: 'Too many attempts for this mobile number.' })
];

// Venue cash tokens: everyone at the venue is on the same Wi-Fi, so count per phone
export const cashTokenLimiter = [
  limiter({ windowMs: 10 * 60 * 1000, max: 500, message: 'Too many token requests from this network.' }),
  limiter({ windowMs: 10 * 60 * 1000, max: 5, byPhone: true, message: 'Too many tokens for this mobile number.' })
];
