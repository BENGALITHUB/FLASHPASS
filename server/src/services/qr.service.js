import crypto from 'crypto';

/*
 * QR tokens: <version>.<passId>.<qrNonce>.<HMAC signature>
 *
 * Keys are read when used (not at import time), so values from .env are always
 * picked up. (They used to be read before .env was loaded, so the built-in
 * fallback secret was used no matter what .env said.)
 *
 * Rotating the secret without breaking passes already sold:
 *   QR_KEY_VERSION=CC2            QR_HMAC_SECRET=<new>
 *   QR_KEY_VERSION_PREVIOUS=CC1   QR_HMAC_SECRET_PREVIOUS=<old>
 * New QRs are signed with the new key; QRs signed with the old key still verify.
 * The gate also checks the nonce against the pass, so a QR cannot be built from
 * a pass ID alone even by someone who knows a key.
 */
export const DEV_FALLBACK_QR_SECRET = 'super_secret_comic_con_hmac_key_2026_xyz123!';

const currentKey = () => ({
  version: process.env.QR_KEY_VERSION || 'CC1',
  secret: process.env.QR_HMAC_SECRET || DEV_FALLBACK_QR_SECRET
});

const keyFor = (version) => {
  const cur = currentKey();
  if (version === cur.version) return cur.secret;
  if (process.env.QR_HMAC_SECRET_PREVIOUS && version === (process.env.QR_KEY_VERSION_PREVIOUS || 'CC1')) {
    return process.env.QR_HMAC_SECRET_PREVIOUS;
  }
  return null;
};

const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22);

/**
 * Generate HMAC-SHA256 signed QR token for a pass
 * Format: <version>.<passId>.<qrNonce>.<signature>
 */
export const generateQRToken = (passId, qrNonce) => {
  const { version, secret } = currentKey();
  const payload = `${version}.${passId}.${qrNonce}`;
  return `${payload}.${sign(payload, secret)}`;
};

/**
 * Verify and parse QR token in constant time
 * Returns { valid: true, passId, qrNonce } or { valid: false }
 */
export const verifyQRToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Empty token' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 4) {
    return { valid: false, reason: 'Invalid token format' };
  }

  const [version, passId, qrNonce, signature] = parts;

  const secret = keyFor(version);
  if (!secret) {
    return { valid: false, reason: 'Unsupported key version' };
  }

  const expectedSig = sign(`${version}.${passId}.${qrNonce}`, secret);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  return {
    valid: true,
    passId,
    qrNonce
  };
};
