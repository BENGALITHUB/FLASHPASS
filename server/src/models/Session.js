import mongoose from 'mongoose';

/**
 * A staff login on one device. The browser only holds a random token in an
 * HttpOnly cookie; this record is what makes it valid, so a session can be
 * ended from the server at any time (logout, PIN change, account switched off,
 * admin "log out this device").
 */
const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String },
  tokenHash: { type: String, required: true, unique: true }, // sha256 of the cookie token
  device: { type: String, default: 'Unknown device' },
  ip: { type: String },
  lastSeenAt: { type: Date, default: Date.now },
  idleTimeoutMs: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String }
}, {
  timestamps: true
});

// MongoDB deletes sessions a day after they expire
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const Session = mongoose.model('Session', sessionSchema);
